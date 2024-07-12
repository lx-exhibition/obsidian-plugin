// 亮模式/暗模式 切换 action
import {Notice} from "obsidian";

export const mode_action = (el: HTMLElement, cls: string = 'mode_action')=>{
	if (!document.getElementById('style-mode_action')){
		let css = document.createElement('style')
		css.id = 'style-mode_action'
		let add_css_rule = (rule: string)=>css.appendChild(document.createTextNode(rule))
		document.head.appendChild(css)
		add_css_rule(`.theme-light .${cls}:hover{ background-color: #e4e4e4 }`)
		add_css_rule(`.theme-light .${cls}::after{ content: '\\1f31e'; font-size: 16px }`)
		add_css_rule(`.theme-dark .${cls}:hover{ background-color: #363636 }`)
		add_css_rule(`.theme-dark .${cls}::after{ content: '\\1f31b'; font-size: 16px }`)
	}

	el.addClass(cls)
	el.onclick = ()=>{
		if (document.body.classList.contains('theme-light')){
			document.body.classList.replace('theme-light', 'theme-dark')
			// new Notice('暗模式')
		}else {
			document.body.classList.replace('theme-dark', 'theme-light')
			// new Notice('亮模式')
		}
	}
	return el
}

export const action = (el: HTMLElement, unicode: string = '1f315')=>{
	el.innerHTML = `&#x${unicode}`
	el.onclick = ()=>{
		let el = document.querySelector('.workspace-leaf.mod-active .cm-editor') as HTMLElement
		let st = el.getAttr('bg')
		let st_ = !st ? 0 : parseInt(st)
		st_ = (st_+1)%3
		el.setAttr('bg', `${st_}`)

		let el1 = document.querySelector('.workspace-leaf-content[data-type="file-explorer"]')as HTMLElement
		el1.setAttr('bg', `${st_}`)
	}
	return el
}

