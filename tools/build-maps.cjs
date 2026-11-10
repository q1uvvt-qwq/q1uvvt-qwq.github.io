'use strict';

// Build from the published note manifest, never from unrelated local directories.
// No packages, network calls, or evaluation of repository JavaScript are needed.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://q1uvvt-qwq.github.io/';

function manifest() {
	const source = fs.readFileSync(path.join(ROOT, 'assets/js/wiki-data.js'), 'utf8');
	const match = source.match(/window\.WIKI\s*=\s*([\s\S]*?);?\s*$/);
	if (!match) throw new Error('Cannot find WIKI manifest');
	return JSON.parse(match[1].replace(/;\s*$/, ''));
}

function plain(text) {
	return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]*>/g, '').replace(/[`*_~]/g, '')
		.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
		.replace(/^>\s*/gm, '').replace(/\s+/g, ' ').trim();
}

function extractSummary(source, title) {
	const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	const explicit = body.match(/^#{1,6}\s*(?:一句话概括|一句话总结|核心概念|概述)[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/m);
	const paragraphs = (explicit ? explicit[1] : body)
		.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
		.split(/\r?\n\s*\r?\n/)
		.map(s => s.split(/\r?\n/).filter(line => !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||!\[|<svg|<!--)/.test(line)).join(' '))
		.map(plain).filter(s => s.length >= 14 && !/^tags:|^source:|^order:/.test(s));
	const text = paragraphs[0] || title;
	const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
	const first = sentences[0].trim();
	return { text: first.length <= 190 ? first : first.slice(0, 186).replace(/[，、；：\s]+$/, '') + '…', explicit: !!explicit };
}

const ALIASES = {
	'SQL注入底层原理-解析与执行的博弈': '原理',
	'联合查询注入完整攻击流程': '联合查询',
	'布尔盲注-原理与利用': '布尔盲注',
	'序列化与反序列化基础': '序列化格式',
	'魔术方法详解': '魔术方法',
	'POP链构造': 'POP链'
};
// Editorial one-sentence summaries where the source starts with a table,
// an introductory question, or a lead-in to a list rather than a complete idea.
const SUMMARY_OVERRIDES = {
	'SQL注入底层原理-解析与执行的博弈': '用户输入被拼入 SQL 并被当成语法执行，打破了数据与代码的边界。',
	'ai-vulnerability-hunting-prompts-methods-survey': 'AI 辅助漏洞分析需要明确范围、拆分任务并利用真实工具反馈迭代，候选发现必须经过可复现证据验证。',
	'功能码总表': 'Modbus 功能码区分读取、写单个与写多个数据对象，异常响应通过原功能码设置最高位来表示处理失败。',
	'共识机制、PoW、PoS与分叉': '共识机制通过验证与分叉选择规则，让节点在延迟、冲突和恶意行为下重新选择共同认可的有效交易历史。',
	'资产与余额': '链上记录资产的存在、控制条件和转移状态，钱包负责管理密钥、创建交易并读取这些记录。',
	'权限、业务逻辑与合约升级': '合约安全需要同时检查谁能调用敏感功能、业务状态能否正确转换，以及升级权限是否会被滥用。',
	'预言机与价格操纵': '预言机向智能合约提供外部数据，价格来源和计算方式会影响借贷、清算与交易逻辑的安全性。',
	'md5与弱比较绕过': '隐式类型转换、PHP 弱比较和原始二进制 MD5 拼接涉及不同机制，分析绕过前需要先确认比较规则与输入所在的上下文。',
	'四类数据对象与地址问题': 'Modbus 按布尔或数值、只读或可写区分四类数据对象，传统编号与报文内地址的差异需要单独核对。',
	'私钥、公钥、地址、钱包与助记词': '私钥生成交易签名，公钥用于验证，地址表示接收或控制资产的条件，钱包管理密钥与交易，助记词用于恢复密钥。',
	'节点通信': '区块链节点通过连接若干对等节点来传播和验证交易与区块，不需要与全网每台计算机直接连接。'
};

function build() {
	const original = manifest();
	const notes = [];
	let explicitCount = 0;
	function convert(node) {
		if (node.children) return group(node.id, node.title, node.children.map(convert));
		const absolute = path.resolve(ROOT, 'wiki', node.path);
		if (!absolute.startsWith(path.join(ROOT, 'wiki') + path.sep)) throw new Error('Note path escaped wiki');
		const summary = extractSummary(fs.readFileSync(absolute, 'utf8'), node.title);
		if (summary.explicit) explicitCount++;
		const stem = path.basename(node.path, '.md');
		const result = { id: node.id, title: node.title, label: ALIASES[stem] || node.title,
			path: node.path, summary: SUMMARY_OVERRIDES[stem] || summary.text,
			summarySource: SUMMARY_OVERRIDES[stem] ? 'editorial' : (summary.explicit ? 'overview' : 'opening'), count: 1, tags: node.tags || [] };
		notes.push(result);
		return result;
	}
	function group(id, title, children, summary) {
		return { id, title, label: title, summary: summary || '从' + title + '的概念、机制与案例入手，串联这一专题的相关笔记。',
			count: children.reduce((sum, item) => sum + item.count, 0), children };
	}
	const tree = original.map(convert);
	const get = id => {
		const node = tree.find(n => n.id === id);
		if (!node) throw new Error('Missing category: ' + id);
		return node;
	};
	const webTopics = get('web知识').children;
	const webGet = title => webTopics.find(n => n.title === title);
	function featured(node, preferred) {
		const selected = preferred.map(name => node.children.find(n => n.path && n.path.endsWith('/' + name + '.md')));
		if (selected.some(n => !n)) throw new Error('Missing featured notes for ' + node.title);
		const ids = new Set(selected.map(n => n.id));
		const others = node.children.filter(n => !ids.has(n.id));
		return { ...node, children: selected.concat(group(node.id + '/more', '更多笔记', others)) };
	}
	const sql = featured(webGet('SQL注入'), ['SQL注入底层原理-解析与执行的博弈', '联合查询注入完整攻击流程', '布尔盲注-原理与利用']);
	const php = featured(webGet('PHP反序列化'), ['序列化与反序列化基础', '魔术方法详解', 'POP链构造']);
	const web = group('web', 'Web安全', [
		sql,
		group('web/files', '文件与执行', ['命令执行与代码执行', '文件上传', '文件包含', '文件读取'].map(webGet), '文件处理或执行边界失守时，输入可能被解释为路径、代码或系统命令。'),
		group('web/server', '服务端漏洞', ['SSRF', 'XXE', 'SSTI'].map(webGet), '梳理服务器发起请求、解析 XML 与渲染模板时的信任边界。'),
		php,
		group('web/basics', '基础与信息收集', [get('00-基础'), get('01-信息收集')], '先理解网络、HTTP 与 PHP，再认识资产、服务和可见的攻击面。'),
		group('web/practice', '实战与工具', [webGet('爆破'), get('11-漏洞挖掘'), get('13-实战与攻击链'), get('14-工具与环境')], '用题解、复现流程和工具环境，把漏洞原理连接到可验证的实验。')
	], '从协议与应用基础出发，理解漏洞机制，并通过题解、复现和工具验证知识。');
	const domains = [web,
		{ ...get('工控安全'), id: 'ics', summary: '以设备、协议和业务过程为线索，理解工控系统的通信、攻击面与操作影响。' },
		{ ...get('蜜罐研究'), id: 'honeypot', summary: '通过诱捕、协议仿真和行为采集，研究欺骗防御的能力、建设路径与边界。' },
		{ ...get('模型构建'), id: 'model', summary: '把主机行为日志转为可建模的事件序列，再研究异常评分、校准与轻量化部署。' },
		{ ...get('区块链安全'), id: 'blockchain', summary: '从密钥、交易与共识出发，理解智能合约、DeFi 与价格操纵的安全边界。' }
	];
	const total = notes.length;
	if (domains.reduce((sum, n) => sum + n.count, 0) !== total) throw new Error('Domain coverage mismatch');
	const overview = group('overview', '个人知识库', domains, '围绕 Web、工控、蜜罐、日志异常检测与区块链，连接基础、原理与实践。');
	const data = { version: 1, total, explicitSummaries: explicitCount, defaultTab: 'web', domains, overview };
	fs.mkdirSync(path.join(ROOT, 'maps/exports'), { recursive: true });
	fs.writeFileSync(path.join(ROOT, 'maps/data.json'), JSON.stringify(data, null, 2) + '\n');
	for (const root of [overview].concat(domains)) {
		const content = [{ id: 'sheet-' + root.id, class: 'sheet', title: root.title,
			rootTopic: topic(root), topicPositioning: 'fixed' }];
		const entries = {
			'content.json': JSON.stringify(content),
			'metadata.json': JSON.stringify({ creator: { name: '71U knowledge map', version: '1' } }),
			'manifest.json': JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } })
		};
		fs.writeFileSync(path.join(ROOT, 'maps/exports', root.id + '.xmind'), zip(entries));
	}
	console.log(JSON.stringify({ total, explicitSummaries: explicitCount, domains: domains.map(n => [n.title, n.count]) }));
	return data;
}

function topic(node) {
	const result = { id: 'n-' + Buffer.from(node.id).toString('hex'), class: 'topic', title: node.label,
		structureClass: 'org.xmind.ui.logic.right', notes: { plain: { content: node.summary } } };
	if (node.path) result.href = SITE + '?note=' + encodeURIComponent(node.id) + '#wiki';
	if (node.children) result.children = { attached: node.children.map(topic) };
	return result;
}

// Standard ZIP (stored entries), with CRC-32 and UTF-8 names. Modern XMind uses
// a ZIP container with content.json, metadata.json and manifest.json.
function zip(entries) {
	const local = [], directory = [];
	let offset = 0;
	for (const [name, value] of Object.entries(entries)) {
		const filename = Buffer.from(name), bytes = Buffer.from(value), checksum = crc32(bytes);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
		header.writeUInt32LE(checksum, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22);
		header.writeUInt16LE(filename.length, 26);
		local.push(header, filename, bytes);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x800, 8); central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
		central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
		directory.push(central, filename); offset += header.length + filename.length + bytes.length;
	}
	const end = Buffer.alloc(22), central = Buffer.concat(directory);
	end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8);
	end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
	return Buffer.concat(local.concat([central, end]));
}

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

module.exports = { build };
if (require.main === module) build();
