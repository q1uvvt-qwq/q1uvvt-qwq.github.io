/*
	posts.js — 博客文章数据。这是日常写作时唯一需要改动的文件。

	新增一篇文章：
	  1. 在 posts/ 下新建 <slug>.html，写入正文片段（用 <h3> 起小标题，
	     不要用 <h2>，因为 <h2> 已被文章标题占用）。
	  2. 在下面的数组里加一条记录。slug 必须与文件名一致（不含 .html），
	     且建议只用英文小写字母、数字和连字符（如 my-first-post），
	     因为 slug 会同时用于文件名、元素 id 与 URL 锚点。

	字段说明：
	  slug    文章标识，必须与 posts/<slug>.html 文件名一致。
	  title   标题。
	  date    日期，格式 YYYY-MM-DD。列表按此字段倒序排列。
	  tags    标签数组，可留空数组。
	  summary 一句话摘要，显示在目录里；留空则不显示。
*/

window.POSTS = [
	{
		slug: 'ai-vulnerability-hunting-prompts-methods-survey',
		title: 'AI 赋能漏洞挖掘：提示词与方法调研整合',
		date: '2026-09-29',
		tags: ['漏洞挖掘', 'AI', '方法论'],
		summary: '公开证据并不支持一段神奇提示词就能自动挖出高质量漏洞：真正起作用的是范围约束、窄任务、工具反馈闭环，以及发现与验证的分离。'
	},
	{
		slug: 'notes-opening',
		title: '写在前面：为什么开始记录',
		date: '2026-09-12',
		tags: ['随笔'],
		summary: '写作是最廉价的验证手段：结果可以复制，轨迹不能。'
	}
];
