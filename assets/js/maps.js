/* Native, buildless mind-map reader. All labels and summaries are text nodes. */
(function () {
	'use strict';
	var article = document.getElementById('maps');
	if (!article) return;
	var stage = article.querySelector('.maps-stage');
	var canvas = article.querySelector('.maps-canvas');
	var tabs = article.querySelector('.maps-tabs');
	var popover = article.querySelector('.maps-popover');
	var outline = article.querySelector('.maps-outline');
	var message = article.querySelector('.maps-message');
	var data, current, request, selected, selectedButton, lastFocus;
	var expanded = new Set(), states = new Map(), nodes = new Map(), rows = new Map();
	var view = { x: 0, y: 0, scale: 1 }, drag = null, moved = false;
	var pendingLayout = 0, popupFrame = 0;

	function element(tag, className, text) {
		var el = document.createElement(tag);
		if (className) el.className = className;
		if (text !== undefined) el.textContent = text;
		return el;
	}
	function showMessage(text) { message.textContent = text || ''; message.hidden = !text; }
	function mapUrl(id) {
		var url = new URL(location.href);
		url.searchParams.delete('note'); url.searchParams.delete('fromMap');
		url.searchParams.set('map', id); url.hash = 'maps';
		return url.pathname + url.search + url.hash;
	}
	function noteUrl(id) {
		var url = new URL(location.href);
		url.searchParams.set('note', id); url.searchParams.set('fromMap', current.id);
		url.hash = 'wiki';
		return url.pathname + url.search + url.hash;
	}
	function walk(node, fn, parent) {
		fn(node, parent);
		(node.children || []).forEach(function (child) { walk(child, fn, node); });
	}
	function load() {
		if (request) return request;
		request = fetch('maps/data.json').then(function (response) {
			if (!response.ok) throw new Error('HTTP ' + response.status);
			return response.json();
		}).then(function (result) {
			data = result;
			article.querySelector('.maps-count').textContent = data.total + ' 篇笔记';
			[data.overview].concat(data.domains).forEach(function (root) {
				var a = element('a', '', root.title === '个人知识库' ? '总览' : root.title);
				a.href = mapUrl(root.id); a.dataset.domain = root.id;
				a.addEventListener('click', function (event) {
					if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
					event.preventDefault(); switchDomain(root.id, true);
				});
				tabs.appendChild(a);
			});
			switchDomain(new URL(location.href).searchParams.get('map') || data.defaultTab, false);
			return data;
		}).catch(function () {
			request = null;
			article.querySelector('.maps-count').textContent = '知识地图暂未载入';
			showMessage('请通过网站或本地 HTTP 服务打开，刷新页面可重新载入。');
		});
		return request;
	}
	function switchDomain(id, navigate) {
		var next = [data.overview].concat(data.domains).find(function (root) { return root.id === id; }) || data.domains[0];
		if (current && current.id === next.id) return;
		if (current) states.set(current.id, new Set(expanded));
		current = next; hidePopover(false); outline.hidden = true;
		article.querySelector('[data-map-action="outline"]').setAttribute('aria-expanded', 'false');
		expanded = states.get(current.id) || new Set([current.id]);
		if (!states.has(current.id) && current.id === 'web') expanded.add('web知识/02-SQL注入');
		nodes.clear(); walk(current, function (node, parent) { nodes.set(node.id, { node: node, parent: parent }); });
		tabs.querySelectorAll('a').forEach(function (a) {
			if (a.dataset.domain === current.id) a.setAttribute('aria-current', 'page');
			else a.removeAttribute('aria-current');
		});
		article.querySelector('#maps-download').href = 'maps/exports/' + current.id + '.xmind';
		if (navigate) history.pushState(null, '', mapUrl(current.id));
		render(true);
	}
	function render(reset) {
		hidePopover(false); rows.clear(); canvas.replaceChildren();
		var list = element('ul', 'maps-tree');
		list.setAttribute('aria-label', current.title);
		list.appendChild(renderNode(current, true)); canvas.appendChild(list);
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'maps-lines'); svg.setAttribute('aria-hidden', 'true');
		canvas.prepend(svg);
		requestAnimationFrame(function () { drawLines(); if (reset) fit(); });
	}
	function renderNode(node, root) {
		var li = element('li', 'maps-node' + (root ? ' maps-root' : ''));
		li.dataset.node = node.id;
		var row = element('div', 'maps-row');
		var button = element('button', 'maps-label', node.label);
		button.type = 'button'; button.title = node.title; button.dataset.topic = node.id;
		button.setAttribute('aria-label', node.title + '，查看一句话总结');
		button.setAttribute('aria-haspopup', 'dialog');
		button.addEventListener('click', function (event) {
			if (moved) return;
			event.stopPropagation(); showPopover(node, button);
		});
		row.appendChild(button);
		if (node.children && node.children.length) {
			var toggle = element('button', 'maps-fold'); toggle.type = 'button';
			toggle.appendChild(element('span'));
			toggle.setAttribute('aria-label', (expanded.has(node.id) ? '收起' : '展开') + node.title);
			toggle.setAttribute('aria-expanded', String(expanded.has(node.id)));
			toggle.addEventListener('click', function (event) {
				event.stopPropagation();
				if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id);
				render(true);
				requestAnimationFrame(function () {
					var replacement = rows.get(node.id);
					if (replacement) replacement.querySelector('.maps-fold').focus({ preventScroll: true });
				});
			});
			row.appendChild(toggle);
		}
		rows.set(node.id, row); li.appendChild(row);
		if (node.children && expanded.has(node.id)) {
			var children = element('ul', 'maps-children');
			node.children.forEach(function (child) { children.appendChild(renderNode(child, false)); });
			li.appendChild(children);
		}
		return li;
	}
	function drawLines() {
		var svg = canvas.querySelector('svg');
		if (!svg) return;
		svg.replaceChildren();
		var bounds = canvas.getBoundingClientRect(), scale = view.scale || 1;
		svg.setAttribute('width', canvas.scrollWidth); svg.setAttribute('height', canvas.scrollHeight);
		rows.forEach(function (row, id) {
			var entry = nodes.get(id), parentRow = entry.parent && rows.get(entry.parent.id);
			if (!parentRow) return;
			var a = parentRow.getBoundingClientRect(), b = row.getBoundingClientRect();
			var x1 = (a.right - bounds.left) / scale, y1 = (a.top + a.height / 2 - bounds.top) / scale;
			var x2 = (b.left - bounds.left) / scale, y2 = (b.top + b.height / 2 - bounds.top) / scale;
			var middle = x1 + (x2 - x1) / 2;
			var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' H ' + middle + ' V ' + y2 + ' H ' + x2);
			svg.appendChild(path);
		});
	}
	function transform() {
		// Keep a dragged map reachable instead of allowing it to disappear
		// completely beyond the touch viewport.
		var width = canvas.scrollWidth * view.scale, height = canvas.scrollHeight * view.scale;
		var minX = Math.min(8, stage.clientWidth - width - 20);
		var maxX = width < stage.clientWidth ? stage.clientWidth - width - 8 : 20;
		var minY = Math.min(8, stage.clientHeight - height - 20);
		var maxY = height < stage.clientHeight ? stage.clientHeight - height - 8 : 20;
		view.x = Math.max(minX, Math.min(maxX, view.x));
		view.y = Math.max(minY, Math.min(maxY, view.y));
		canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
	}
	function fit() {
		if (!stage.clientWidth || !canvas.scrollWidth) return;
		var width = canvas.scrollWidth, height = canvas.scrollHeight;
		var mobile = window.innerWidth <= 736;
		view.scale = mobile ? .86 : Math.max(.38, Math.min(1, (stage.clientWidth - 20) / width, (stage.clientHeight - 20) / height));
		view.x = mobile ? 8 : 30;
		view.y = Math.max(8, (stage.clientHeight - height * view.scale) / 2);
		transform();
	}
	function showPopover(node, button) {
		if (selected === node && !popover.hidden) { hidePopover(true); return; }
		hidePopover(false); selected = node; selectedButton = button; lastFocus = document.activeElement;
		if (button) button.classList.add('is-selected');
		var entry = nodes.get(node.id), parent = entry && entry.parent;
		article.querySelector('#maps-popover-title').textContent = (parent && parent.id !== current.id ? parent.label + ' · ' : '') + node.label;
		article.querySelector('.maps-summary').textContent = node.summary;
		var read = article.querySelector('.maps-read');
		read.hidden = !node.path;
		if (node.path) read.href = noteUrl(node.id);
		popover.hidden = false;
		positionPopover();
		article.querySelector('.maps-popover-close').focus({ preventScroll: true });
	}
	function positionPopover() {
		popover.style.width = '';
		if (popover.hidden || !selectedButton || window.innerWidth <= 736) return;
		var shell = article.getBoundingClientRect(), target = selectedButton.getBoundingClientRect();
		var width = popover.offsetWidth, height = popover.offsetHeight;
		var left = Math.min(article.clientWidth - width - 24, Math.max(24, target.left - shell.left + 12));
		var above = target.top - shell.top - height - 18;
		var below = above < 94;
		var top = below ? target.bottom - shell.top + 18 : above;
		var side = below ? 'below' : 'above';
		var rightSpace = article.clientWidth - 24 - (target.right - shell.left + 32);
		if (below && rightSpace >= 220) {
			popover.style.width = Math.min(width, rightSpace) + 'px';
			width = popover.offsetWidth; height = popover.offsetHeight;
			left = target.right - shell.left + 32;
			top = target.top - shell.top - 12;
			side = 'right';
		}
		top = Math.max(20, Math.min(article.clientHeight - height - 20, top));
		popover.style.left = left + 'px'; popover.style.top = top + 'px';
		popover.dataset.side = side;
		popover.style.setProperty('--tip-x', Math.max(16, Math.min(width - 30, target.left - shell.left - left + target.width / 2)) + 'px');
	}
	function hidePopover(restore) {
		popover.hidden = true;
		if (selectedButton) selectedButton.classList.remove('is-selected');
		if (restore && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
		selected = null; selectedButton = null;
	}
	function renderOutline() {
		outline.replaceChildren();
		function item(node) {
			var li = element('li');
			if (node.children) {
				var details = element('details'); details.open = node.id === current.id;
				details.appendChild(element('summary', '', node.label));
				var ul = element('ul'); node.children.forEach(function (child) { ul.appendChild(item(child)); });
				details.appendChild(ul); li.appendChild(details);
			} else {
				var button = element('button', '', node.title); button.type = 'button';
				button.addEventListener('click', function () { showPopover(node, button); });
				li.appendChild(button);
			}
			return li;
		}
		var ul = element('ul'); ul.appendChild(item(current)); outline.appendChild(ul);
	}
	function setFullscreen(active) {
		var native = document.fullscreenElement === article;
		if (!active) {
			article.classList.remove('is-fullscreen');
			if (native && document.exitFullscreen) document.exitFullscreen().catch(function () {});
		} else if (article.requestFullscreen) {
			article.requestFullscreen().catch(function () { article.classList.add('is-fullscreen'); onResize(); });
		} else article.classList.add('is-fullscreen');
		updateFullscreen(); requestAnimationFrame(onResize);
	}
	function updateFullscreen() {
		var active = document.fullscreenElement === article || article.classList.contains('is-fullscreen');
		var button = article.querySelector('[data-map-action="fullscreen"]');
		button.textContent = active ? '退出全屏' : '全屏'; button.setAttribute('aria-pressed', String(active));
	}
	function onResize() {
		cancelAnimationFrame(pendingLayout);
		pendingLayout = requestAnimationFrame(function () {
			drawLines(); fit(); positionPopover(); updateFullscreen();
			article.querySelector('.maps-hint').textContent = window.innerWidth <= 736 ? '拖动导图，点击节点查看总结' : '点击节点查看一句话总结';
		});
	}
	article.querySelectorAll('[data-map-action]').forEach(function (button) {
		button.addEventListener('click', function () {
			if (!current) return;
			var action = button.dataset.mapAction;
			if (action === 'expand') { walk(current, function (node) { if (node.children) expanded.add(node.id); }); render(true); }
			if (action === 'collapse') { expanded = new Set([current.id]); render(true); }
			if (action === 'fullscreen') setFullscreen(!(document.fullscreenElement === article || article.classList.contains('is-fullscreen')));
			if (action === 'outline') {
				outline.hidden = !outline.hidden; button.setAttribute('aria-expanded', String(!outline.hidden));
				if (!outline.hidden) { renderOutline(); outline.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
			}
		});
	});
	article.querySelector('.maps-popover-close').addEventListener('click', function () { hidePopover(true); });
	article.querySelector('.maps-read').addEventListener('click', function (event) {
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
		if (selected && selected.path && window.KnowledgeWiki) {
			event.preventDefault(); var note = selected; hidePopover(false);
			window.KnowledgeWiki.open(note.id, current.id);
		}
	});
	stage.addEventListener('pointerdown', function (event) {
		if (event.target.closest('button')) return;
		moved = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: view.x, startY: view.y };
		stage.setPointerCapture(event.pointerId);
	});
	stage.addEventListener('pointermove', function (event) {
		if (!drag || drag.id !== event.pointerId) return;
		var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; hidePopover(false); stage.classList.add('is-dragging'); }
		view.x = drag.startX + dx; view.y = drag.startY + dy; transform();
	});
	function endDrag() { drag = null; stage.classList.remove('is-dragging'); setTimeout(function () { moved = false; }, 0); }
	stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
	stage.addEventListener('click', function (event) { if (!event.target.closest('button')) hidePopover(false); });
	stage.addEventListener('dblclick', function (event) { if (!event.target.closest('button')) fit(); });
	stage.addEventListener('wheel', function (event) {
		event.preventDefault(); hidePopover(false);
		if (event.ctrlKey || event.metaKey) {
			var bounds = stage.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
			var next = Math.max(.25, Math.min(2.5, view.scale * Math.exp(-event.deltaY * .003)));
			view.x = x - (x - view.x) * next / view.scale; view.y = y - (y - view.y) * next / view.scale; view.scale = next;
		} else { view.y -= event.deltaY; view.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0); }
		transform();
	}, { passive: false });
	stage.addEventListener('keydown', function (event) {
		if (event.target !== stage) return;
		var steps = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] };
		if (steps[event.key]) { event.preventDefault(); hidePopover(false); view.x += steps[event.key][0]; view.y += steps[event.key][1]; transform(); }
		if (event.key === 'Home') { event.preventDefault(); fit(); }
	});
	function route() {
		if (location.hash !== '#maps') { hidePopover(false); if (article.classList.contains('is-fullscreen') || document.fullscreenElement === article) setFullscreen(false); return; }
		if (!data) load(); else {
			switchDomain(new URL(location.href).searchParams.get('map') || data.defaultTab, false);
			requestAnimationFrame(onResize);
		}
	}
	window.KnowledgeMap = {
		consumeEscape: function () {
			if (!popover.hidden) { hidePopover(true); return true; }
			if (article.classList.contains('is-fullscreen') || document.fullscreenElement === article) { setFullscreen(false); return true; }
			return false;
		}
	};
	window.addEventListener('hashchange', route); window.addEventListener('popstate', route);
	window.addEventListener('resize', onResize); document.addEventListener('fullscreenchange', onResize);
	window.addEventListener('scroll', function () {
		if (popover.hidden) return;
		cancelAnimationFrame(popupFrame); popupFrame = requestAnimationFrame(positionPopover);
	}, { passive: true });
	new MutationObserver(function () { if (article.classList.contains('active')) onResize(); }).observe(article, { attributes: true, attributeFilter: ['class', 'style'] });
	if (document.fonts) document.fonts.ready.then(onResize);
	route();
})();
