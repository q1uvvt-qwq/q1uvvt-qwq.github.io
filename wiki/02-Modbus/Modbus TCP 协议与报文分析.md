## Modbus TCP 协议与报文分析

理解：

```
设备数据怎样映射成寄存器
→ 客户端如何构造请求
→ 服务器如何返回响应
→ 异常请求应该怎样处理
→ 蜜罐如何表现得像一台真实设备
```



## Modbus 

Modbus 是一种应用层请求—响应协议。
基本关系是：
添加到对话

```
￼
Client 发出 Request
Server 处理请求
Server 返回 Response
```

传统资料中也常使用 Master/Slave，但当前更适合使用 Client/Server。
在泵站中：
• HMI 或 SCADA 通常是 Client。
• PLC、RTU、仪表通常是 Server。
• Client 主动发起读取或写入。
• Server 通常不会主动向 Client 推送数据。
Modbus 规范定义通信报文，不定义水泵、水位、温度分别放在哪个寄存器。寄存器如何使用由设备厂商或项目设计者决定。



## Modbus TCP

添加到对话

```
Modbus TCP ADU
├── MBAP Header
└── Modbus PDU
     ↓
TCP
     ↓
IP
     ↓
Ethernet
```

Modbus TCP 默认使用 TCP 502 端口，但端口号不是判断协议的唯一依据。
标准 Modbus TCP 通常没有：
• 用户身份认证。
• 消息加密。
• 消息完整性保护。
• 对读取者和写入者的细粒度授权。
Modbus Organization 另有基于 TLS 和证书的 Modbus Security，但不能因此假设传统 502 端口上的 Modbus TCP 已经具备这些安全能力。



**TCP 是字节流，不是报文队列**

这是编写蜜罐时非常重要的一点。

一次 TCP 接收操作可能得到：

- 一个完整 Modbus 报文。
- 半个 Modbus 报文。
- 两个或多个连续 Modbus 报文。
- 前一个报文的结尾加下一个报文的开头。

因此不能假设：

```
一次 recv() = 一个 Modbus 请求
```

正确做法是根据 MBAP Header 中的 Length 字段确定完整报文边界。



真正发送到网络上的嵌套结构是：

```
Ethernet 帧
└── IP 数据包
    └── TCP 段
        └── Modbus TCP ADU
            ├── MBAP Header
            └── Modbus PDU
```

可以把它理解成“信封套信封”。



##  Modbus PDU

PDU 是 Protocol Data Unit，表示具体的 Modbus 操作。

结构是：

```
PDU = Function Code + Data
```

#### Function Code

功能码占 1 字节，表示要执行什么操作。

| 功能码 | 含义                     |
| ------ | ------------------------ |
| `0x01` | 读取 Coils               |
| `0x02` | 读取 Discrete Inputs     |
| `0x03` | 读取 Holding Registers   |
| `0x04` | 读取 Input Registers     |
| `0x05` | 写单个 Coil              |
| `0x06` | 写单个 Holding Register  |
| `0x0F` | 写多个 Coils             |
| `0x10` | 写多个 Holding Registers |

#### Data

Data 部分根据功能码变化，可能包含：

- 起始地址。
- 读取数量。
- 写入值。
- 字节数。
- 多个寄存器的数据。

例如：

```
03 00 00 00 02
```

含义是：

| 字节    | 含义                   |
| ------- | ---------------------- |
| `03`    | 读取 Holding Registers |
| `00 00` | 起始地址为 0           |
| `00 02` | 读取两个寄存器         |

PDU 只关心“执行什么 Modbus 操作”，它不包含 IP 地址、TCP 端口或 MAC 地址。



##  MBAP Header

MBAP 是 Modbus Application Protocol Header，固定为 7 字节。

```
MBAP Header
├── Transaction Identifier  2 字节
├── Protocol Identifier     2 字节
├── Length                  2 字节
└── Unit Identifier         1 字节
```

#### Transaction Identifier

用于关联请求和响应。

例如客户端发送：

```
Transaction ID = 0x0001
```

服务器响应也应返回：

```
Transaction ID = 0x0001
```

客户端可能连续发送多个请求，因此需要用它判断响应属于哪个请求。

它有点像“工单编号”。

#### Protocol Identifier

标准 Modbus TCP 通常为：

```
0x0000
```

这是为了标识当前承载的是 Modbus 协议。

#### Length

表示从 Unit Identifier 开始，后面还有多少字节。

它包含：

- Unit Identifier。
- Function Code。
- PDU Data。

它不包含 Transaction ID、Protocol ID 和 Length 字段本身。

#### Unit Identifier

用于标识逻辑设备。

如果直接连接一台 Modbus TCP 设备，它经常是 `1` 或 `255`，具体行为取决于设备。

在 TCP—串口网关场景中，它可能对应网关后面的串口从站：

```
Modbus TCP Client
        ↓
TCP/RTU 网关
        ├── Unit ID 1 → PLC 1
        ├── Unit ID 2 → PLC 2
        └── Unit ID 3 → 仪表
```



#### Unit Identifier 的作用

Unit Identifier 占一个字节。

在 Modbus TCP 直接连接中，它可能只是一个设备或逻辑单元标识；经过 TCP—串口网关时，它可以用于指向网关后面的具体串口设备。

不同设备对 Unit ID 的处理可能不同：

- 只接受特定值。
- 忽略该字段。
- 将不同 Unit ID 映射为不同设备。
- 对不存在的 Unit ID 不响应或返回异常。

这种差异以后可以成为设备指纹的一部分。



## Modbus TCP ADU

假设要读取 Unit ID 1、地址 0 开始的两个 Holding Registers：

```
00 01 00 00 00 06 01 03 00 00 00 02
```

拆解如下：

```
MBAP Header
00 01    Transaction ID = 1
00 00    Protocol ID = 0
00 06    后续长度 = 6
01       Unit ID = 1

Modbus PDU
03       读取 Holding Registers
00 00    起始地址 = 0
00 02    数量 = 2
```

所以：

```
Modbus TCP ADU
= MBAP Header + Modbus PDU
```

完整报文长度是 12 字节。



## TCP

Modbus TCP ADU 会被放入 TCP 的数据部分。

TCP 主要负责：

- 建立连接。
- 保证数据可靠到达。
- 保证数据顺序。
- 对丢失数据进行重传。
- 流量控制。
- 将数据交给正确端口上的应用程序。

#### TCP 端口

典型连接可能是：

```
客户端：192.168.1.10:53000
服务器：192.168.1.20:502
```

其中：

- `53000` 是客户端临时端口。
- `502` 是 Modbus TCP 默认服务器端口。

#### TCP Header 主要字段

| 字段                  | 作用                  |
| --------------------- | --------------------- |
| Source Port           | 来源应用端口          |
| Destination Port      | 目标应用端口          |
| Sequence Number       | 字节流序号            |
| Acknowledgment Number | 确认已接收的数据      |
| Flags                 | SYN、ACK、FIN、RST 等 |
| Window Size           | 接收窗口              |
| Checksum              | 检测传输错误          |

建立连接时通常经历：

```
Client → Server：SYN
Server → Client：SYN + ACK
Client → Server：ACK
```

然后才传输 Modbus 数据。

#### TCP 没有 Modbus 报文边界

TCP 提供的是连续字节流。

一个 Modbus 报文可能被拆成两个 TCP 段：

```
TCP 段 1：MBAP 的前半部分
TCP 段 2：MBAP 剩余部分 + PDU
```

两个 Modbus 报文也可能合并在一个 TCP 段中：

```
TCP 段
├── Modbus ADU 1
└── Modbus ADU 2
```

因此，Modbus 服务端必须读取 MBAP 的 Length 字段来恢复报文边界。



## 逐层封装

应用程序先生成：

```
Modbus PDU
03 00 00 00 02
```

添加 MBAP：

```
MBAP + PDU
00 01 00 00 00 06 01 03 00 00 00 02
```

TCP 添加端口、序列号等信息：

```
TCP Header
+ Modbus TCP ADU
```

IP 添加源和目标 IP：

```
IP Header
+ TCP Header
+ Modbus TCP ADU
```

Ethernet 添加源和目标 MAC：

```
Ethernet Header
+ IP Header
+ TCP Header
+ Modbus TCP ADU
+ FCS
```