import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	EditorSuggest,
	EditorPosition,
	TFile,
	EditorSuggestTriggerInfo,
	Editor,
	EditorSuggestContext,
	ButtonComponent, Modal, Menu, setTooltip, MenuItem, TFolder, TAbstractFile
} from 'obsidian';
import {WorkspaceLeaf,ItemView} from 'obsidian'
import {mode_action,action} from 'apis/els'
import {git, repos, git_conf, rest, get_tree_rec, get_tree_items, Node} from 'apis/github-req'
import './my.css'
// import {loadOml2d} from 'oh-my-live2d'
import {exec} from 'child_process'
import {random} from "nanoid";
import {h} from "vue";

// module_settings
type Module = 'default' | 'git' | 'file_manager'
type MySetting = Record<Module, Record<string, any>>
class MyPluginSettingTab extends PluginSettingTab {
	plugin: MyPlugin
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}
	async display() {
		// console.log('display')
		await this.plugin.render_settings()
	}
}

export default class MyPlugin extends Plugin {
	async onload() {
		console.log('onload')

		// module_pdf_opender
		//@ts-ignore
		this.app.viewRegistry.typeByExtension['pdf'] = ''

		await this.module_settings()

		this.module_remote_file_manager()

		this.module_general_actions()

		await this.module_query_remote_repo()

		this.module_editor_render()

		this.module_file_opened()

		this.module_code_complement()

		this.module_commands_register()

		this.module_glob()

		this.extension__file_explorer()
	}

	onunload() {
		console.log('unload')
	}

	// @设置
	settingTab: MyPluginSettingTab
	settings: MySetting = {
		default: {
			example: "example setting",
		},
		git: {

		},
		file_manager: {
			user: 'lx-exhibition',
			repo: 'obsidian-public'
		},

	}
	async module_settings(){
		await this.read_settings()
		await this.save_settings()
		this.settingTab = new MyPluginSettingTab(this.app, this)
		this.addSettingTab(this.settingTab)
		// console.log(this.settings)
	}
	async read_settings(){
		let local_settings = await this.loadData() || {}
		Object.keys(this.settings).forEach((v: Module)=>{
			this.settings[v] = Object.assign({}, this.settings[v], local_settings[v])
		})
		// console.log(this.settings)
		return this.settings
	}
	async save_settings(){
		await this.saveData(this.settings)
		return this.settings
	}
	async read_setting(module: Module){
		let local_settings = await this.loadData()
		return this.settings[module] = Object.assign({}, this.settings[module], local_settings[module])
	}
	async save_setting(module: Module){
		let local_settings = await this.loadData()
		local_settings[module] = Object.assign({}, local_settings[module], this.settings[module])
		await this.saveData(local_settings)
		return this.settings[module]
	}
	async render_settings(){
		await this.read_setting('default')
		this.settingTab.containerEl.empty()
		new Setting(this.settingTab.containerEl)
			.setName('example setting')
			.setDesc('example description')
			.addText((text) => {
				text.setPlaceholder('example placeholder')
					.setValue(this.settings.default.example)
					.onChange(async (val)=>{
						this.settings.default.example = val
						this.settings.git = {}
						await this.save_setting('default')
					})
			})
	}

	// 格式化当前时间
	cur(){
		const now = new Date()

		const year = now.getFullYear()
		const month = String(now.getMonth() + 1).padStart(2, '0') // getMonth() 返回值为 0-11，因此需要加 1
		const day = String(now.getDate()).padStart(2, '0')

		const hours = String(now.getHours()).padStart(2, '0')
		const minutes = String(now.getMinutes()).padStart(2, '0')
		const seconds = String(now.getSeconds()).padStart(2, '0')

		return {
			file: `${year}${month}${day}${hours}${minutes}${seconds}`,
			commit: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
		}
	}

	async upload_base64(repo: string, path: string, suf: string, base64_str: string, now = {file: '', commit: ''}){
		if (!now.file.length && !now.commit.length){
			now = this.cur()
		}
		let res = await repos.createOrUpdateFileContents({...git_conf,
			repo: repo,
			path: `${path}/${now.file}.${suf}`,
			content: base64_str,
			message: `upload file: ${now.commit}`
		})
		// console.log(res)
		return res.data.content
	}
	async file_to_base64(file: File, cb: (base64_str: string)=>any){
		let reader = new FileReader()
		reader.onload = ()=>{
			//@ts-ignore
			let str = reader?.result?.split(',')[1]
			cb(str)
		}
		reader.readAsDataURL(file)
	}
	async delete_linktext_file (name: string, suf: string){
		let assets_path = await this.app.fileManager.getAvailablePathForAttachment('')
		assets_path = assets_path.substring(0, assets_path.length-2)
		let path = await this.app.fileManager.getAvailablePathForAttachment(`${name}.${suf}`)
		path = path.replace(`${assets_path}/`,'')

		let num = parseInt(path.replace(`${name} `, '').replace(`.${suf}`, ''))
		name = num>=2 ? `${name} ${num-1}` : name
		let f = this.app.vault.getFileByPath(`${assets_path}/${name}.${suf}`)
		console.log(f?.path)
		if (f){
			await this.app.vault.delete(f)
		}
	}
	to_regex(str: string){
		return new RegExp(str.replace(/\//g, '\\/').replace(/\./g, '\\.').replace(/\?/g, '\\?'))
	}
	module_remote_file_manager(){
		let { user: USER, repo: REPO } = this.settings.file_manager
		// console.log(USER, REPO)

		// (2-1) 上传粘贴的文件
		this.registerEvent(this.app.workspace.on('editor-paste', async (e,editor,info)=>{
			let file = e.clipboardData?.files[0]
			// 仅上传第一个文件
			if (file){
				console.log(`uploading ${file.name}`)
				let upload = async (mime_prefix: string, paste_template: string, path = '')=>{
					if (!path.length){
						path = mime_prefix
					}
					if (file?.type.startsWith(mime_prefix)){
						let now = this.cur()
						let spl = file.name.split('.'), suf = spl[spl.length-1]

						// 阻止默认行为
						e.preventDefault()

						let cursor = editor.getCursor()
						let loading_url = `![${now.file}.${suf}#waiting...](https://raw.githubusercontent.com/${USER}/${REPO}/main/loading.png#${file.name})`
						editor.transaction({
							changes: [{text: loading_url, from: cursor}]
						})
						await this.file_to_base64(file, async (base64_str)=>{
							let content = await this.upload_base64(REPO, path, suf, base64_str)
							let paste_str = paste_template
								.replace(/{{now}}/g, now.file)
								.replace(/{{suf}}/g, suf)
								.replace(/{{url}}/g, `${content.download_url}?sha=${content.sha}`)
							// console.log(paste_template, paste_str)

							let cursor_after = editor.getCursor()
							editor.undo()
							editor.transaction({
								changes: [{text: paste_str, from: cursor}]
							})
							// 恢复文件上传完成前一刻的光标位置
							editor.setCursor(cursor_after)
							// 将文件 url 复制到粘贴板中，防止下次重复上传文件
							await navigator.clipboard.writeText(paste_str)

							await this.delete_linktext_file(`Pasted image ${now.file}`, suf)
							if (file){
								await this.delete_linktext_file(file.name.substring(0,file.name.length-suf.length-1), suf)
							}
						})


						return true
					}
					return false
				}
				let ok = await upload('image', '![{{now}}.{{suf}}]({{url}})')
					|| await upload('video', `<video controls width="300"><source src="{{url}}" type="video/mp4" /></video>`)
					|| await upload('audio', '<audio controls="" controlslist="" src="{{url}}"></audio>')
			}
			let type = e.clipboardData?.types[0]
			if (type?.startsWith('text/plain')){
				e.clipboardData?.items[0].getAsString(str=> {
					// console.log(str)
				})
			}
			// console.log(e.clipboardData?.dropEffect)
			// console.log(e.clipboardData?.files)
			// console.log(e.clipboardData?.types)
			// console.log(e.clipboardData?.items)
		}))
		this.registerEvent(this.app.workspace.on('url-menu',(menu, url)=>{
			// menu.setUseNativeMenu(false)

			// (2-2) url 上下文菜单中检索被引用的文件，及被引用的数量
			menu.addItem( (item)=>{
				item.setSection('file-url-manage').setTitle('query url dependencies')
					.onClick(async (e)=>{
						let notice = ''
						let files = this.app.vault.getMarkdownFiles()
						for (let i = 0; i < files.length; i++) {
							let v = files[i]
							let content = await this.app.vault.read(v)
							let regex_url = url.replace('/','\\/').replace('.','\\.').replace('?','\\?')
							let matches = content.match(new RegExp(`\\!\\[[^\\[\\]]*\\]\\(${regex_url}\\)`, 'g'))
							if (matches){
								notice += `${v===this.app.workspace.getActiveFile() ? '$ ' : ''}${v.path} => ${matches.length}\n`
							}
						}
						new Notice(notice)
					})
			})

			// (2-3) url 上下文菜单中删除文件
			// https://raw.githubusercontent.com/lx-exhibition/obsidian-public/main/images/20240604191255.png?sha=ba3da17313769f27c50388207631fc4716a861f5
			let regex = new RegExp(`https:\\/\\/raw\\.githubusercontent\\.com\\/([^\\/]*)\\/([^\/]*)\\/main\\/([^?]*)\\?sha=(\\w{40,40})`, 'g')
			if (url.match(regex)){
				let [user, repo, path, sha] = url.replace(regex, '$1#$2#$3$4').split('#')
				console.log(user, repo, path, sha)
				if (user === USER && repo === REPO){
					menu.addItem((item)=> {
						item.setSection('file-url-manage').setTitle('delete remote image/file').onClick(async (e) => {
							repos.deleteFile({...git_conf, repo, path, sha,
								message: `delete image: ${this.cur().commit}`
							}).then((res: any) => {
								if (!res) return
								console.log(res)
								console.log(`deleted image ${url}`)
								new Notice(`successfully deleted image ${url}`)
							})
						})
					})
				}
			}
		}))

		// (2-4) 删除指定范围文本中的远程附件
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, info)=>{
			if (editor.somethingSelected()){
				menu.addItem((item)=>
					item.setSection('file-url-manage')
						.setTitle(`delete selected files(${USER}/${REPO})`)
						.onClick((e)=>{
							let str = editor.getSelection()
							let regex = new RegExp(`https:\\/\\/raw\\.githubusercontent\\.com\\/${USER}\\/${REPO}\\/main\\/([^?]*)\\?sha=(\\w{40,40})`, 'g')
							let m = str.match(regex)
							if (m){
								m.forEach((v)=>{
									let [path, sha] = v.replace(regex, '$1#$2').split('#')
									repos.deleteFile({...git_conf, repo: REPO, path, sha,
										message: `delete file: ${this.cur().commit}`
									}).then((res: any)=>{
										if (!res) return
										console.log(res)
										console.log(`deleted file ${path}`)
										new Notice(`successfully deleted file ${path}`)
									})
								})
							}
						})
				)
			}
		}))
	}

	reg_action(icon: string, cb: (evt: MouseEvent)=>any, init?: (el: HTMLElement)=>any){
		let sb = this.addStatusBarItem()
		if (init){
			init(sb)
		}
		sb.createDiv({}, (el)=>{
			el.innerHTML = icon
			el.className = 'status-bar-item-icon'
			// el.onmouseenter = ()=>{ sb.style.backgroundColor = '#e4e4e4' }
			// el.onmouseleave = ()=>{ sb.style.backgroundColor = '#f6f6f6' }
			el.onmouseover = ()=>{ sb.style.backgroundColor = 'var(--background-modifier-hover)' }
			el.onmouseout = ()=>{ sb.style.backgroundColor = 'var(--background-secondary)' }
			el.onclick = cb
		})
	}
	runBatFile(filePath: string) {
		//@ts-ignore
		let base = this.app.vault.adapter.basePath
		exec(`start cmd.exe /K "${base}/${filePath}"`, (error, stdout, stderr) => {
			if (error) {
				new Notice(`Error: ${error.message}`);
				return;
			}
			if (stderr) {
				new Notice(`Stderr: ${stderr}`);
				return;
			}
			new Notice(`Output: ${stdout}`);
		});
	}
	set_item(item: MenuItem, content: string, tag?: string | number){
		//@ts-ignore
		let dom: HTMLElement = item.dom
		dom.empty()
		dom.createDiv({cls: 'nav-file-title'}, (el)=>{
			el.style.padding = '0px'
			el.createDiv({cls: 'nav-file-title-content'}, (el: HTMLElement)=> el.innerHTML = "  " + content )
			if (tag){
				el.createDiv({cls: 'nav-file-tag'}, (el: HTMLElement)=> el.innerHTML = `${tag}`)
			}
		})
		return item
	}
	get_file_el(f: TFile, tag?: string){
		return createDiv({cls: 'nav-file-title', attr: {'data-path': f.path}}, (el)=>{
			el.style.padding = '0px'
			el.createDiv({cls: 'nav-file-title-content'}, (el: HTMLElement)=> el.innerHTML = "  " + f.basename )
			el.createDiv({cls: 'nav-file-tag'}, (el: HTMLElement)=> el.innerHTML = tag || f.extension )
			el.onmouseover = ()=>{
				let fa = el.parentElement
				if (!fa) return
				el.style.backgroundColor = 'rgba(0,0,0,0)'
			}
		})
	}
	set_file_item(item: MenuItem, path: string, tag?: string){
		let f = this.app.vault.getFileByPath(path)
		if (!f) return
		let el = this.get_file_el(f, tag)
		//@ts-ignore
		item.dom.empty()
		//@ts-ignore
		item.dom.appendChild(el)
		//@ts-ignore
		item.dom.onmousedown = (e) => {
			if (e.button === 1){
				this.app.workspace.openLinkText(path, '', true)
			}else if (e.button === 0){
				this.app.workspace.openLinkText(path, '')
			}
		}
		return item
	}
	// unicode 表情转 16 进制
	trans_uni(str: string){
		return str.replace(/[\ud800-\udbff][\udc00-\udfff]/g, function (char) {
			let codePoint =
				(char.charCodeAt(0) - 0xd800) * 0x400 + (char.charCodeAt(1) - 0xdc00) + 0x10000
			return codePoint.toString(16)
		})
	}
	format_time(delta?: number, format?: string){
		let date = delta ? new Date(delta) : new Date()
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, '0') // getMonth() 返回值为 0-11，因此需要加 1
		const day = String(date.getDate()).padStart(2, '0')
		format = format ? format : '%Y/%M/%D %h:%m:%s'

		const hours = String(date.getHours()).padStart(2, '0')
		const minutes = String(date.getMinutes()).padStart(2, '0')
		const seconds = String(date.getSeconds()).padStart(2, '0')
		format = format.replace(/%Y/g, `${year}`)
		format = format.replace(/%M/g, `${month}`)
		format = format.replace(/%D/g, `${day}`)
		format = format.replace(/%h/g, `${hours}`)
		format = format.replace(/%m/g, `${minutes}`)
		format = format.replace(/%s/g, `${seconds}`)
		return format
	}
	tip(delta: number){
		delta = Math.ceil(delta/1000)
		if (delta <= 60) return "<1min"
		else if (delta <= 3 * 60) return "<3min"
		else if (delta <= 10 * 60) return "<10min"
		else if (delta <= 30 * 60) return "<30min"
		else if (delta <= 3600) return "<1hour"
		else if (delta <= 3 * 3600) return "<3hour"
		else if (delta <= 6 * 3600) return "<6hour"
		else if (delta <= 12 * 3600) return "<12hour"
		else if (delta <= 24 * 3600) return "<1day"
		else if (delta <= 7 * 24 * 3600) return "<7day"
		else if (delta <= 15 * 24 * 3600) return "<15day"
		else if (delta <= 30 * 24 * 3600) return "<1mon"
		else if (delta <= 90 * 24 * 3600) return "<3mon"
		else if (delta <= 180 * 24 * 3600) return "<6mon"
		else if (delta <= 366 * 24 * 3600) return "<1year"
		else return '>1year'
	}
	module_general_actions(){
		// 重新加载 obsidian
		this.app.workspace.onLayoutReady(()=>this.reg_action('&#x1f5d8', ()=>{ location.reload() }, (el)=>{
			setTooltip(el, 'reload', {placement: 'top'})
		}))

		// 快捷打开文件
		this.reg_action('&#x1f4d8', (e)=>{
			let menu = new Menu()
			menu.setUseNativeMenu(false)
			let mp = this.app.metadataCache.resolvedLinks['quick/quick.md']
			if (mp){
				for (let [k, v] of Object.entries(mp)){
					menu.addItem(item => {
						const f = this.app.vault.getFileByPath(k)
						if (!f) return
						let el = this.get_file_el(f)
						//@ts-ignore
						item.dom.empty()
						//@ts-ignore
						item.dom.appendChild(el)
						//@ts-ignore
						// item.titleEl.appendChild(el)
						// item.onClick(() => this.app.workspace.openLinkText(f.path, ''))
						//@ts-ignore
						item.dom.onmousedown = (e) => {
							if (e.button === 1){
								this.app.workspace.openLinkText(f.path, '', true)
							}else if (e.button === 0){
								this.app.workspace.openLinkText(f.path, '')
							}
						}
						//@ts-ignore
						setTooltip(item.dom, f.path, {placement: 'right'})
					})
				}
			}
			menu.showAtMouseEvent(e)
		}, (el)=>{
			setTooltip(el, 'quick(quick/quick.md)', {placement: 'top'})
			// 右键点击
			el.oncontextmenu = ()=>this.app.workspace.openLinkText('quick/quick.md', '')
		})
		// 最近修改的 .md 文件
		this.reg_action('&#x1f4dd', (e)=>{}, (el)=> {
			setTooltip(el, 'recent modified files\n左键 -> 最近修改的文本\n右键 -> 日统计\n中键 -> 月统计', {placement: 'top'})
			let data: {[k: string]: number} = {}, path = '.obsidian/lx-work.json'
			let load = async ()=>{
				// 记录
				if (!(await this.app.vault.adapter.exists(path))){
					await this.app.vault.create(path, '')
				}
				let res = await this.app.vault.adapter.read(path)
				data = Object.assign({}, JSON.parse(res || "{}"))
			}
			let write = async (cnt: number)=>{
				await load()
				data[this.format_time(undefined, '%Y/%M/%D')] = cnt
				await this.app.vault.adapter.write(path, JSON.stringify(data))
			}

			// badge 用于表示最近一天有多少文件被修改
			el.classList.add('badge-container')
			let bd = el.createSpan({cls: 'badge'}, (bd)=>{
				let up = async ()=>{
					let files = this.app.vault.getMarkdownFiles()
					let cnt = 0
					files.forEach(v => {
						// 最近 24 h 内
						// if (new Date().getTime()-v.stat.mtime < 1000 * 60 * 60 * 24){
						// 今天 00:00 开始
						if (new Date(new Date().toLocaleDateString()).getTime() <= v.stat.mtime){
							++cnt
						}
					})
					bd.innerHTML=`${cnt}`

					await write(cnt)
				}
				up()
				// this.registerEvent(this.app.workspace.on('editor-change', (file)=>up()))
				this.registerEvent(this.app.vault.on('create', (file)=>up()))
				this.registerEvent(this.app.vault.on('delete', (file)=>up()))
				this.registerEvent(this.app.vault.on('modify', (file)=>up()))
			})

			// 查看当天修改的文本
			el.addEventListener('click', async (e) => {
				let menu = new Menu()
				menu.setUseNativeMenu(false)
				let files = this.app.vault.getMarkdownFiles().sort((a,b)=>a.stat.mtime<b.stat.mtime ? -1 : (a.stat.mtime>b.stat.mtime ? 1 : 0))
				files.slice(files.length-Math.max(10, parseInt(bd.innerHTML)),files.length).forEach(v => {
					menu.addItem(item => {
						this.set_file_item(item, v.path, this.tip(new Date().getTime()-v.stat.mtime))
						//@ts-ignore
						item.dom.oncontextmenu = ()=>{
							let l = this.app.workspace.getLeaf(false)
							l.setViewState({type: 'diff-view', state: {file: v.path, staged: false}})
						}
						//@ts-ignore
						setTooltip(item.dom, `${v.path}\n${this.format_time(v.stat.mtime)}`, {placement: 'left'})
					})
				})
				menu.showAtMouseEvent(e)
			})

			// 查看往日的统计工作量
			el.oncontextmenu = async (e)=>{
				await load()
				let menu = new Menu()
				menu.setUseNativeMenu(false)
				for (let [k, v] of Object.entries(data)){
					menu.addItem(item => this.set_item(item, k, v))
				}

				menu.showAtMouseEvent(e)
			}

			// 查看每月的统计工作量
			el.onmousedown = async (e)=>{
				if (e.button === 1){
					await load()
					let menu = new Menu()
					menu.setUseNativeMenu(false)
					let map: {[k: string]: number} = {}
					for (let [k, v] of Object.entries(data)){
						let spl = k.split('/')
						let key = `${spl[0]}/${spl[1]}`
						map[key] = (map[key] ?? 0) + v
					}
					for (let [k, v] of Object.entries(map)){
						menu.addItem(item => this.set_item(item, k, v))
					}
					menu.showAtMouseEvent(e)
				}
			}
		})
		// 最近打开的 .md 文件
		this.reg_action('&#128203', (e)=>{}, (el)=> {
			setTooltip(el, 'recent files', {placement: 'top'})
			el.addEventListener('click', async (e) => {
				let menu = new Menu()
				menu.setUseNativeMenu(false)
				this.app.workspace.getLastOpenFiles().reverse().forEach(v => {
					const f = this.app.vault.getFileByPath(v)
					if (!f) {
						// console.log(v)
						return
					}
					menu.addItem(item => {
						this.set_file_item(item, f.path, this.tip(new Date().getTime()-f.stat.mtime))
						//@ts-ignore
						setTooltip(item.dom, `${f.path}\n${this.format_time(f.stat.mtime)}`, {placement: 'left'})
					})
				})
				menu.showAtMouseEvent(e)
			})

		})
		// 快捷执行脚本
		this.reg_action('&#x1f5f2', (e)=>{
			this.app.vault.adapter.list('quick').then(res=>{
				let menu = new Menu()
				menu.setUseNativeMenu(false)
				res.files.forEach(v => {
					let f = this.app.vault.getFileByPath(v)
					let ext = f?.extension || ''
					if (['exe', 'lnk', 'bat'].contains(ext) || 1){
						menu.addItem(item => {
							item.setTitle(`${v.substring(6,v.length-4)}${' '.repeat(3)}`).onClick(()=>{
								this.runBatFile(v)
							}).setIcon('file-terminal')
							//@ts-ignore
							item.titleEl.createSpan({cls: 'nav-file-tag'}, (el)=>el.innerHTML=ext)
							//@ts-ignore
							setTooltip(item.dom, ext, {placement: 'right'})
						})
					}
					// console.log(v)
				})
				menu.showAtMouseEvent(e)
			})
		}, (el)=>{
			setTooltip(el, 'quick-exe', {placement: 'top'})
			el.style.color = 'darkgoldenrod'
			el.style.transform = 'rotate(-40deg)'
		})
		// 打开 docs-hwo/thinking.md 或 docs-tmp/thinking.md
		this.reg_action('&#x1f9e0', ()=>{ this.app.workspace.openLinkText('docs-hwo/thinking.md', '') }, (el)=>{
			setTooltip(el, 'thinking:\n左键 -> docs-hwo/thinking.md\n右键 -> docs-tmp/thinking.md', {placement: 'top'})
			el.oncontextmenu = ()=>this.app.workspace.openLinkText('docs-tmp/thinking.md', '')
		})
		// 打开 entries.md
		this.reg_action('&#x1f6aa', ()=>{ this.app.workspace.openLinkText('entries.md', '') }, (el)=>{
			setTooltip(el, 'entries', {placement: 'top'})
		})
		//
		this.reg_action('&#127744', ()=>{}, (el)=>{
			setTooltip(el, 'play', {placement: 'top'})
			let add_delta = (delta: number)=>{
				let code = (parseInt(parseInt(this.trans_uni(el.innerText), 16).toString(10)) + delta).toString(16)
				if (el.firstElementChild){
					el.firstElementChild.innerHTML = eval('"\\u{' + code + '}"')
				}
				setTooltip(el, `\\u{${code}}`, {placement: 'top'})
			}
			el.addEventListener('click', ()=>add_delta(1))
			el.addEventListener('contextmenu', ()=>add_delta(-1))
			el.onmousedown = (e)=>{
				if (e.button === 1) add_delta(Math.floor(Math.random()*500-250))
			}
		})

		// 左侧栏 => 暗/亮 模式切换
		let rb = this.addRibbonIcon('', 'example ribbon icon', (e)=> {})
		mode_action(rb.createEl('div'))

		// 状态栏 => 暗/亮 模式切换
		let sb = this.addStatusBarItem()
		mode_action(sb.createEl('div'))
		// 状态栏 => 背景图片切换
		action(sb.createEl('div'))

		// editor actions => 暗/亮 模式切换
		let add_action = ()=>{
			let els = document.getElementsByClassName('view-actions')
			for (let i = 0; i < els.length; i++) {
				let el = els[i]
				let setting_el = el.querySelector('[aria-label="更多选项"]')
				if (setting_el && !el.getElementsByClassName('mode_action').length){
					setting_el.insertAdjacentElement('beforebegin', mode_action(document.createElement('div')))
					// setting_el.insertAdjacentElement('beforebegin', action(document.createElement('div')))
				}
			}
		}
		this.registerEvent(this.app.workspace.on('file-open',()=>add_action()))
		add_action()

		// 重新加载 obsidian
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, info)=>{
			menu.addItem(item => item.setTitle('reload').onClick(e => location.reload()))
		}))

		// 切换平台
		//@ts-ignore
		this.addRibbonIcon(!this.app.isMobile ? 'toggle-left' : 'toggle-right', 'switch platform', (e)=>this.app.emulateMobile(!this.app.isMobile))

	}

	async set_dir_menu(menu: Menu, path: string){
		menu.setUseNativeMenu(false)
		const f = this.app.vault.getFolderByPath(path)
		if (!f) return
		let res = await this.app.vault.adapter.list(path)
		res.folders.forEach(v => {
			const spl = v.split('/'), suf = spl.last()
			menu.addItem(item => {
				let el = createDiv({cls: 'nav-folder-title', attr: {'data-path': v}}, (el)=>{
					el.style.padding = '0px'
					el.createDiv({cls: 'nav-folder-title-content'}, (el)=>el.innerHTML = "  " + suf)
					el.onmouseover = ()=>{
						let fa = el.parentElement
						if (!fa) return
						el.style.backgroundColor = 'rgba(0,0,0,0)'
					}
				})
				//@ts-ignore
				let dom: HTMLElement = item.dom
				dom.empty()
				dom.appendChild(el)

				//@ts-ignore
				this.set_dir_menu(item.setSubmenu(), v)

				let flg = false
				//@ts-ignore
				let sub: Menu = item.submenu, sub_dom: HTMLElement = sub.dom
				sub_dom.onmouseenter = ()=>{ flg=true }
				sub_dom.onmouseleave = ()=>{ flg=false }
				dom.onmouseenter = ()=>setTimeout(()=>{
					//@ts-ignore
					menu.items.forEach(v => v?.submenu?.close())
					sub_dom.show()
				}, 40)
				dom.onmouseleave = ()=>setTimeout(()=>{
					!flg ? sub.close() : 0
				}, 50)
			})
			//@ts-ignore
			let dom: HTMLElement = menu.dom
		})
		res.files.forEach(v => {
			const f = this.app.vault.getFileByPath(v)
			if (!f) return
			menu.addItem(item => {
				this.set_file_item(item, f.path)
				//@ts-ignore
				setTooltip(item.dom, `${f.path}\n${this.format_time(f.stat.mtime)}`, {placement: 'left'})
			})
		})
	}
	module_file_opened(){
		let on_open = (cb: (file: TFile, header: HTMLElement, content: HTMLElement)=>any)=>{
			this.registerEvent(this.app.workspace.on('file-open', (file)=>{
				document.querySelectorAll('.view-header').forEach((v: HTMLElement) => {
					let path = v.innerText.replace(/\n/g, '')
					if (v.parentElement?.getAttr('data-type') === 'markdown' && file && `${path}.md` === file.path){
						if (v.nextElementSibling){
							cb(file, v, v.nextElementSibling as HTMLElement)
						}
					}
				})
			}))
		}

		// 打开的 .md 文件的祖先目录的关于其子孙文件/目录的上下文菜单（可新建文件）
		on_open((file, header)=>{
			let dp = file.path.split('/')
			let bs = header.findAll('.view-header-breadcrumb')

			bs.forEach((v,i) => {
				dp[i] = i ? `${dp[i-1]}/${dp[i]}` : dp[i]

				this.app.vault.adapter.list(dp[i]).then(res => {
					v.oncontextmenu = (e)=>{
						let menu = new Menu()
						// menu.setUseNativeMenu(false)
						// // console.log(dp[i], res.files)
						// res.files.forEach(w => {
						// 	menu.addItem(item => {
						// 		let spl = w.split('/'), basename = spl[spl.length-1]
						// 		item.setTitle(basename)
						// 		//@ts-ignore
						// 		setTooltip(item.dom, w, {placement: 'right'})
						// 		item.onClick(() => this.app.workspace.openLinkText(w, ''))
						// 	})
						// })
						// menu.showAtMouseEvent(e)

						// 新建文件的 modal
						menu.addItem(item => {
							item.setIcon('file').setTitle('new file').onClick(()=>{
								let modal = new Modal(this.app), el = modal.contentEl
								let file_name = '', suf = 'md'
								let create = async ()=>{
									// let file_path = `${path.substring(0, path.lastIndexOf('/'))}/${file_name || '未命名'}.${suf}`
									let file_path = `${dp[i]}/${file_name || '未命名'}.${suf}`
									// console.log(file_name, suf, file_path)
									await this.app.vault.create(file_path, '')
									await this.app.workspace.openLinkText(file_path, '')
									let selectText = (sel: string) => {
										let el: HTMLElement | null = document.querySelector(sel)
										if (!el){
											return
										}
										var selection = window.getSelection()
										var range = document.createRange()
										range.selectNodeContents(el)
										selection?.removeAllRanges()
										selection?.addRange(range)
									}
									selectText('.inline-title')
									modal.close()
								}
								let add_setting = (name?: string | null, cb?: (setting: Setting)=>any)=>{
									let set = new Setting(el)
									if (name){
										set.setDesc(name)
									}
									if(cb){
										cb(set)
									}
								}
								add_setting('file name', setting=>setting
									.addText(c=>{
										c
											.setValue(`${dp[i]}/`)
											.setDisabled(true)
										setTooltip(c.inputEl, `${dp[i]}/`)
									})
									.addText(c=>c
										.setValue(file_name)
										.onChange(v => file_name = v)
										.setPlaceholder('未命名')
										.inputEl.onkeydown = (e)=>e.key==='Enter' ? create() : 0
									)
									.addDropdown(c=>c
										.addOptions({md: 'markdown', js: 'javascript'})
										.setValue(suf)
										.onChange(v => suf = v)
									)
								)
								add_setting(null, setting=>setting
									.addButton(c=>c
										.onClick(async e => {
											create()
										}).setButtonText('create')
									)
								)
								modal.open()
							})
						})
						// 文件树上下文菜单
						this.set_dir_menu(menu, dp[i]).then(()=>menu.showAtMouseEvent(e))
					}
					setTooltip(v, `${res.files.length} files\n${res.folders.length} folders`)
				})
			})
		})

		//
		let up = (text: string | number)=>{
			let sb: HTMLElement | null = document.querySelector('#size-counter')
			if (!sb){
				sb = this.addStatusBarItem()
				sb.id = 'size-counter'
			}
			sb.innerText = `${text}`
			setTooltip(sb, `${text} byte`, {placement: 'top'})
		}
		up('xxxx')
		on_open((file, header, content)=>{
			up(file.stat.size)
			this.registerEvent(this.app.workspace.on('editor-change', (editor, info)=>{
				up(file.stat.size)
			}))
		})

		let on = (cb: (file: TFile, header: HTMLElement, content: HTMLElement)=>any)=>{
			let run = ()=>{
				let file = this.app.workspace.getActiveFile()
				if (!file) return
				document.querySelectorAll('.view-header').forEach((v: HTMLElement) => {
					let path = v.innerText.replace(/\n/g, '')
					if (v.parentElement?.getAttr('data-type') === 'markdown' && file && `${path}.md` === file.path){
						if (v.nextElementSibling){
							cb(file, v, v.nextElementSibling as HTMLElement)
						}
					}
				})
			}
			this.registerEvent(this.app.workspace.on('file-open', ()=>run()))
			this.registerEvent(this.app.vault.on('modify', ()=>run()))
			// this.registerEvent(this.app.workspace.on('layout-change', ()=>run()))
		}

		// on((file, header, content)=>{
		// 	// content.querySelector('.cm-content')?.querySelectorAll('span').forEach(v => v.style.backgroundColor='red')
		// 	let ct = content.querySelector('.cm-content')
		// 	if (!ct) return
		// 	ct.querySelectorAll('a').forEach(v => console.log(v))
		// })

		// .md 编辑器上方的 action
		on_open((file, header)=>{
			let act = header.find('.view-actions')
			// let more = header.find('.clickable-icon.view-action[aria-label="更多选项"]')
			let add = (cls: string, content: string, cb: (e: MouseEvent)=>any, tip?: string)=>{
				if (!act.querySelector(`.${cls}`)){
					act.insertAfter(createDiv({cls: `clickable-icon ${cls}`}, el=>{
						if (tip){
							el.ariaLabel = tip
						}
						el.innerHTML = content
						el.onclick = (e)=>cb(e)
					}), null)
				}
			}
			add('copy-path', '&#x1f5ca;', ()=>{
				navigator.clipboard.writeText(file.path)
				new Notice('copied')
			}, '复制路径')
		})

		on((file, header, content)=>{
			content.querySelectorAll('.cm-line').forEach(v=>{
				if (v.innerHTML.startsWith('注：')){
					console.log(v)
				}
			})
		})
	}

	async module_query_remote_repo(){
		this.registerView('my-view-type', (leaf)=>new MyItemView(leaf, this))

		// this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf)=>{
		// 	// console.log(leaf?.getViewState())
		// }))

		this.addRibbonIcon('github', 'open obsidian-public',async ()=>{
			let l = this.app.workspace.getLeaf(true)
			await l.setViewState({type: 'my-view-type'})
			this.app.workspace.revealLeaf(l)
		})
		this.app.workspace.onLayoutReady(async ()=>{
			let l = this.app.workspace.getLeftLeaf(false)
			await l?.setViewState({type: 'my-view-type'})
		})

		this.register(()=>{
			// console.log(this.app.workspace.getLeavesOfType('my-view-type'))
			this.app.workspace.getLeavesOfType('my-view-type').forEach(v=>v.detach())
			// this.app.workspace.detachLeavesOfType('my-views-type')
		})
	}
	async get_tree_el(repo: string, reflash = false){
		let USER = 'lx-exhibition'
		let REPO = repo


		let nodes = (await this.read_setting('git'))[repo]
		if (!Array.isArray(nodes) || !(nodes as Node[]).push || reflash){
			try {
				nodes = (await get_tree_rec(repo, 'heads/main')).childs
				this.settings.git[repo] = nodes
			}catch (e){
				// this.settings.git[repo] = []
				return createEl('div')
			}
			await this.save_setting('git')
		}
		// console.log(nodes)

		let get_el = async (nodes: Node[])=>{
			let el = createEl('div', {cls: 'tree-item-children nav-folder-children'})
			el.hide()
			el.createEl('div', {attr: {style: 'width: 176px; height: 0.1px; margin-bottom: 0px;'}})

			for (let i = 0; i < nodes.length; i++) {
				let v = nodes[i]
				let arr = v.data.path.split('/'), label = arr[arr.length-1]
				if (v.data.type === 'tree'){
					let dir = el.createEl('span', {cls: 'tree-item nav-folder'})
					let title = dir.createEl('span', {cls: 'tree-item-self is-clickable nav-folder-title'})
					// title.createEl('span').innerHTML = '<div class="tree-item-icon collapse-icon nav-folder-collapse-indicator"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg></div>'
					title.createEl('span', {cls: 'tree-item-inner nav-folder-title-content', text: label, attr: {'data-path': v.data.path}})
					if (v.childs.length > 0){
						let sub = await get_el(v.childs)
						title.onclick = ()=>sub.isShown() ? sub.hide() : sub.show()
						dir.appendChild(sub)
					}
				}
			}
			for (let i = 0; i < nodes.length; i++) {
				let v = nodes[nodes.length-i-1]
				let arr = v.data.path.split('/'), label = arr[arr.length-1]
				if (v.data.type !== 'tree'){
					let file = el.createEl('div', {cls: 'tree-item nav-file'})
					file.createEl('div', {cls: 'tree-item-self is-clickable nav-file-title'})
						.createEl('div', {cls: 'tree-item-inner nav-file-title-content', text: `${label}  (${v.data.size})`, attr: {'data-path': v.data.path}})
						.onclick = ()=>{
							let {path,sha} = v.data
							let spl = path.split('.'), suf = spl[spl.length-1], name = path.replace(`.${suf}`,'')
							let url = `https://raw.githubusercontent.com/${USER}/${REPO}/main/${path}?sha=${sha}`
							let paste = ''
							if (['bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif']
								.contains(suf)){
								paste = `![](${url})`
							}else if (['mp4', 'webm', 'ogv', 'mov', 'mkv']
								.contains(suf)){
								paste = `<video controls width="300"><source src="${url}" type="video/mp4" /></video>`
							}else if (['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus']
								.contains(suf)){
								paste = `<audio controls="" controlslist="" src="${url}"></audio>`
							}else{
								paste = url
							}
							navigator.clipboard.writeText(paste)
							new Notice('copied')

							console.log(paste)
						}
					file.createEl('div', {cls: 'tree-item-children'})
				}
			}
			return el
		}

		let root = createEl('div', {cls: 'nav-files-container node-insert-event show-unsupported'})
			.createEl('div', {cls: 'tree-item nav-folder mod-root'})
		let title = root.createEl('div', {cls: 'tree-item-self nav-folder-title'})
			.createEl('div', {cls: 'tree-item-inner nav-folder-title-content'})
		title.createEl('span', {text: repo})
		title.createEl('span', {}, (el)=>{
			el.innerHTML = '&#x1f9fe;'
			// el.onclick = ()=>
		})
		let sub = root.appendChild(await get_el(nodes))
		title.onclick = ()=>sub.isShown() ? sub.hide() : sub.show()
		sub.show()
		return root
	}

	module_editor_render(){

		const ALL_EMOJIS: Record<string, string> = {
			"+1": "👍",
			"sunglasses": "😎",
			"smile": "😄",
		}

		this.registerMarkdownPostProcessor((el, ctx)=>{
			let codeblocks = el.findAll('code')
			// console.log(codeblocks)
			for (let cb of codeblocks){
				let text = cb.innerText.trim()
				cb.replaceWith(cb.createEl('code',{
					text: ALL_EMOJIS[text] ?? text
				}))
				// console.log(cb)
			}
		})


		// 水平分割线 的标号（另一部分参见 my.scss）
		this.registerMarkdownPostProcessor((el, ctx)=>{
			if (el.className !== 'table-cell-wrapper'){
				let hr = el.find('hr')
				if (hr){
					hr.createDiv({cls: 'hr-title'}, (el)=>el.innerHTML='')
				}
			}
		})

		// csv 转表格
		this.registerMarkdownCodeBlockProcessor('csv', (source, el, ctx)=>{
			let div = el.createEl('div')
			div.setAttr('style', 'width: 95%')
			let h1 = div.createEl('h1')
			h1.innerText = 'csv'
			h1.setAttr('style', 'text-align: center')

			let table = el.createEl('table')
			let tbody = table.createEl('tbody')

			source.split('\n')
				.filter((row) => row.length>0)
				.forEach((v)=>{
					let tr = tbody.createEl('tr')
					v.split(',').forEach((w)=>{
						tr.createEl('td', {text: w}, (el)=>{
							let c = [0,1,2,3,4,5,6,7,8,9,'a','b','c','d','e']
							let rd = ()=>c[Math.floor(Math.random()*16)]
							el.setAttr('style', `color: #${rd()}${rd()}${rd()}${rd()}${rd()}${rd()}; text-align: center`)
						})
					})
				})
			table.setAttr('style', 'width: 95%')
		})

		let netease_block = (lang: string, type: number, height: number, width = '95%')=>{
			this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx)=>{
				let frame = (id: string | number)=>{
					return createEl('iframe', {cls: 'iframe',attr: {src: `https://music.163.com/outchain/player?type=${type}&id=${id}&&height=${height}`,
							width, height: height+20}})
				}

				let ids = []
				try {
					ids = JSON.parse(source)
				}catch (e){
					el.appendText(`${lang}: parse error`)
				}
				if (Array.isArray(ids)) {
					ids.forEach((v: string | number) => {
						el.appendChild(frame(v))
					})
				}else {
					el.appendChild(frame(ids))
					// el.appendText(`${lang}: data is not an string/number array`)
				}
			})
		}
		// 歌单 list
		netease_block('netease-s', 0, 32)
		netease_block('netease-m', 0, 90)
		// netease_block('netease-l', 0, 430)
		netease_block('netease-l', 0, 460)
		netease_block('netease-l-s', 0, 32)
		netease_block('netease-l-m', 0, 90)
		netease_block('netease-l-l', 0, 430)
		// 专辑 album
		netease_block('netease-a-s', 1, 32)
		netease_block('netease-a-m', 1, 90)
		netease_block('netease-a-l', 1, 430)
		// 歌曲 song
		netease_block('netease-s-l', 2, 32)
		netease_block('netease-s-m', 2, 66)

		// let sb = this.addStatusBarItem()
		// sb.appendChild(createEl('iframe', {attr: {src: `https://music.163.com/outchain/player?type=${0}&id=${10146142535}&&height=${32}`,
		// 		width: '300', height: 32+20, }}))

	}

	module_code_complement(){
		let suggest = new MyEditorSuggest(this.app)
		// this.registerEditorSuggest(suggest)
	}

	module_commands_register(){
		this.addCommand({id: 'osv', name: 'open surfing view', callback: ()=>{
				let el = document.querySelector('.workspace-split.mod-vertical.mod-root .workspace-tab-header-new-tab>.clickable-icon[aria-label="新标签页"]')
				//@ts-ignore
				el.click()
			}, hotkeys: [{modifiers: ['Ctrl', 'Shift'], key: 'n'}]})
	}

	module_glob(){
		this.registerView('glob', (leaf)=>new GlobView(leaf))
		this.addCommand({id: 'glob', name: 'global replace view', callback: ()=>{
			let l = this.app.workspace.getLeaf(true)
				l.setViewState({type: 'glob'}).then(()=>{
					this.app.workspace.setActiveLeaf(l)
				})
			}})
		this.register(()=>{
			this.app.workspace.getLeavesOfType('glob').forEach(v=>v.detach())
		})
	}

	extension__file_explorer(){
		this.app.workspace.onLayoutReady(()=>{
			let el = createDiv({cls: 'nav-header'}).createDiv({cls: 'nav-buttons-container tool-icons'})
			let add_icon = (pseudoElt: string, icon: string, pseudoElt_icon: string)=>{
				let icon_el = el?.createDiv({cls: 'clickable-icon nav-action-button'})
				if(icon_el){
					icon_el.innerHTML = icon
					icon_el.onclick = () => {
						document.querySelectorAll('.nav-files-container>div>.nav-folder').forEach((v: HTMLElement) => {
							v.show()
							let title = v.querySelector('.nav-folder-title')
							if (title && getComputedStyle(title, pseudoElt).getPropertyValue('content') !== `"${pseudoElt_icon}"`
								&& pseudoElt.length) {
								v.hide()
							}
							// console.log(title && getComputedStyle(title, pseudoElt).getPropertyValue('content'), `"${pseudoElt_icon}"`)
						})
					}
				}
			}
			add_icon('', '🔘', '')
			add_icon('::before', '🌐', '🌐')
			add_icon('::after', '📜', ' 📜')
			add_icon('::after', '🖫', ' 🖫')

			let header = document.querySelector('[data-type="file-explorer"]>.nav-header')
			header?.querySelectorAll('.tool-icons').forEach(v=>v.detach())
			let container = header?.querySelector('.nav-buttons-container')
			container?.insertAdjacentElement('afterend', el)

		})
		// this.app.workspace.onLayoutReady(()=>{
		// 	let el = createDiv({cls: 'nav-header'}).createDiv({cls: 'nav-buttons-container tool-test'})
		// 	let icon = el.createDiv({cls: 'clickable-icon nav-action-button'})
		// 	icon.innerHTML = '🪑'
		// 	icon.onclick = (e)=>{
		// 		let menu = new Menu()
		// 		let add_item = (pseudoElt: string, icon: string, pseudoElt_icon: string)=>{
		// 			menu.addItem(item => {
		// 				item.setTitle(icon).onClick(()=>{
		// 					document.querySelectorAll('.nav-files-container>div>.nav-folder').forEach((v: HTMLElement) => {
		// 						v.show()
		// 						let title = v.querySelector('.nav-folder-title')
		// 						if (title && getComputedStyle(title, pseudoElt).getPropertyValue('content') !== `"${pseudoElt_icon}"`
		// 							&& pseudoElt.length) {
		// 							v.hide()
		// 						}
		// 					})
		// 				})
		// 			})
		// 		}
		// 		add_item('', '🔘', '')
		// 		add_item('::before', '🌐', '🌐')
		// 		add_item('::after', '📜', ' 📜')
		// 		add_item('::after', '🖫', ' 🖫')
		// 		menu.showAtMouseEvent(e)
		// 	}
		//
		// 	let header = document.querySelector('[data-type="file-explorer"]>.nav-header')
		// 	header?.querySelectorAll('.tool-test').forEach(v=>v.detach())
		// 	let container = header?.querySelector('.nav-buttons-container')
		// 	container?.insertAdjacentElement('afterend', el)
		// })
	}
}

class MyItemView extends ItemView{
	ob: MyPlugin
	constructor(leaf: WorkspaceLeaf, ob: MyPlugin) {
		super(leaf);
		this.ob = ob
	}
	getDisplayText(): string { return "my-view-display"; }
	getViewType(): string {	return "my-view-type"; }


	async onOpen(){
		this.icon = 'book-up'
		// this.app.workspace.revealLeaf(this.leaf)
		let btn = new ButtonComponent(this.contentEl.createEl('div'))
			.setIcon('refresh-ccw')
		btn.buttonEl.style.margin = '0 auto'
		btn.buttonEl.style.display = 'block'
		// btn.setClass('a-circle')
		this.boby = this.contentEl.createEl('div')
		this.boby.appendChild(await this.ob.get_tree_el('obsidian-public', false))
		btn.onClick(async (e)=>await this.update())
	}
	boby: HTMLElement
	async update(){
		let now = await this.ob.get_tree_el('obsidian-public', true)
		this.boby.remove()
		this.boby = this.contentEl.createEl('div')
		this.boby.appendChild(now)
	}
}

class MyEditorSuggest extends EditorSuggest<any>{
	constructor(app: App) {
		super(app);
		this.setInstructions([
			{command: 'ctrl+shit+gaobili', purpose: '搞比利'},
		])
	}

	open() {
		super.open();
	}
	close() {
		super.close();
	}

	from: EditorPosition
	to: EditorPosition
	justClosed: boolean
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		if (this.justClosed || !cursor.ch) {
			this.justClosed = false;
			return null;
		}

		let prefix = editor.getLine(cursor.line).substring(0, cursor.ch)
		let match = prefix.match(/@\w*$/)
		// console.log('tri')
		if (match){
			this.from = { line: cursor.line, ch: match.index ?? 0}
			this.to = { line: cursor.line, ch: cursor.ch }
			return {
				start: { line: cursor.line, ch: match.index ?? 0},
				end: cursor,
				query: match[0]
			}
		}
		return null
	}
	getSuggestions(context: EditorSuggestContext): any[] | Promise<any[]> {
		// console.log('sug')

		let ret = []
		for (let i = 0; i < context.query.length; i++) {
			ret.unshift(context.query.substring(0, i+1))
		}
		return ret
	}
	renderSuggestion(value: any, el: HTMLElement) {
		console.log('ren')
		el.setText(value)
	}
	selectSuggestion(value: any, evt: MouseEvent | KeyboardEvent) {
		let editor = this.app.workspace.activeEditor?.editor
		if (editor){
			// console.log(this.from, this.to)
			console.log(value)
			editor.replaceRange(value, this.from, this.to)
		}

		this.close()
		this.justClosed = true
	}
}

class GlobView extends ItemView{
	getDisplayText(): string { return "glob"	}
	getViewType(): string { return "glob"	}

	async onOpen(){
		let txt = this.contentEl.createEl('div')
			.createEl('input', {attr: {style: 'margin: 2px'}, placeholder: 'pattern', title: 'pattern'})
		let rep = this.contentEl.createEl('div')
			.createEl('input', {attr: {style: 'margin: 2px'}, placeholder: 'replace text', title: 'replace text'})
		let div = this.contentEl.createEl('div')
		let config = this.contentEl.createEl('div', {attr: {style: 'margin: 2px'}})
		let res = this.contentEl.createEl('div')

		let regex_toggle = div.createEl('input', {type: 'checkbox', title: 'use regex'})
		let cnt_span = config.createEl('div',{attr: {style: 'height: 20px'}})

		let search_btn = div.createEl('button', {attr: {style: 'margin-left: 5px'}}, (el)=>el.innerHTML='search')
		let search = async ()=>{
			res.empty()

			let files = this.app.vault.getMarkdownFiles()
			let cnt = 0
			for (let i = 0; i < files.length; i++) {
				let v = files[i]
				let str = await this.app.vault.read(v)
				let matchs = [...str.matchAll(new RegExp(txt.value, 'g'))]
				if (matchs.length){
					res.createEl('div').createEl('button', {title: `${v.path} (${matchs.length})`, attr: {style: 'width: 180px; margin: 2px'}},
						(el)=>el.innerHTML=v.name)
						.onclick = ()=>{
						let l = this.app.workspace.getLeaf(false)
						l.setViewState({type: 'markdown', state: {file: v.path}})
					}
					++cnt
				}
			}
			cnt_span.innerHTML = `${cnt}`
		}
		search_btn.onclick = search
		txt.onkeydown = (e)=>{
			if (e.key === 'Enter'){
				search()
			}
		}

		let replace = async ()=>{
			res.empty()
			if (!txt.value.length){
				return
			}
			let cnt = 0
			let files = this.app.vault.getMarkdownFiles()
			for (let v of files) {
				await this.app.vault.process(v, (str)=>{
					let matchs = [...str.matchAll(new RegExp(txt.value, 'g'))]
					if (matchs.length){
						res.createEl('button', {title: `${v.path} (${matchs.length})`, attr: {style: 'width: 180px; margin: 2px'}},
							(el)=>el.innerHTML=v.name).onclick = ()=>{
							let l = this.app.workspace.getLeaf(false)
							l.setViewState({type: 'markdown', state: {file: v.path}})
						}
						new ButtonComponent(res).setIcon('github').onClick(()=>{
							let l = this.app.workspace.getLeaf(false)
							l.setViewState({type: 'diff-view', state: {file: v.path, staged: false}})
						})
						cnt++
						return str.replace(new RegExp(txt.value,'g'), rep.value)
					}else {
						return str
					}
				})
			}
			new Notice('ok')
			cnt_span.innerHTML = `${cnt}`
		}
		div.createEl('button', {attr: {style: 'margin-left: 5px'}}, (el)=>el.innerHTML='replace').onclick = ()=>{
			new YN_Modal(this.app, replace).open()
		}
		div.createEl('button', {attr: {style: 'margin-left: 5px'}}, (el)=>el.innerHTML='count').onclick = async ()=>{
			res.empty()
			let cnt = 0
			let files = this.app.vault.getMarkdownFiles()
			for (let v of files) {
				let matchs = [...(await this.app.vault.read(v)).matchAll(new RegExp(txt.value, 'g'))]
				if (matchs.length){
					cnt++
				}
			}
			cnt_span.innerHTML = `${cnt}`
		}

		// this.app.workspace.iterateAllLeaves((l)=>console.log(l.getViewState()))
	}
}

class YN_Modal extends Modal{
	cb: ()=>any
	constructor(app: App, cb: () => any) {
		super(app);
		this.cb = cb;
	}
	onOpen() {
		this.contentEl.createEl('button', {attr: {style: 'margin-left: 50%'}}, (el)=>{el.innerHTML='yes'}).onclick = ()=>{
			this.cb()
			this.close()
		}
	}
	onClose() {
		this.contentEl.empty()
	}
}

