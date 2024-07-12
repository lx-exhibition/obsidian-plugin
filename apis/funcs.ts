
export const download_ob_resource = async (url: string)=>{
	let body = await (await fetch(url)).arrayBuffer()
	let u = URL.createObjectURL(new Blob([body], {type: 'arraybuffer'}))
	let el_a = document.createElement('a')
	el_a.href = u
	el_a.download = 'out.png'
	el_a.click()
	return body
}

import axios from 'axios'
export const download_resource = async (url: string, suffix: string = 'png')=>{
	let res = await axios.get(`http://localhost:8000?url=${url}`, {responseType: 'arraybuffer'})
	let u = URL.createObjectURL(new Blob([res.data], {type: 'arraybuffer'}))
	let el_a = document.createElement('a')
	el_a.href = u
	el_a.download = `${new Date().getTime()}.${suffix}`
	el_a.click()
	return res.data
}

export const decode_app_uri = (url: string)=>{
	let match = decodeURI(url).match(/[C-Z]:(\/[^/?]+)*/)
	return match ? match[0] : null
}

export class Util{
	static bg(){
		let css = document.createElement('style')
		if (document.getElementById('style-action')){
			css = Object.assign(document.getElementById('style-action') as HTMLElement, css)
		}else {
			css.id = 'style-action'
			document.head.appendChild(css)
		}
		let add_css_rule = (rule: string)=>css.appendChild(document.createTextNode(rule))
		css.innerHTML = ''
		add_css_rule(`.workspace-leaf.mod-active .cm-editor{background-image: url(https://sex.nyan.xyz/api/v2/img?r18=true&author_uuid=66371932&author_uuid=70395770&author_uuid=17516104&author_uuid=14496985&author_uuid=13835102&author_uuid=1642433&author_uuid=23040640&t=${new Date().getTime()})}`)
	}
}
