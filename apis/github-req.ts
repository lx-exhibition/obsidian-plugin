import {Octokit} from "octokit"
import {components} from '@octokit/openapi-types'
import {Notice} from "obsidian"

let token = 'xxxxxx'
let octokit = new Octokit({
	auth: atob(atob(token)),
	// request: {
	// 	timeout: 1
	// }
})
octokit.hook.before('request',async (options: any)=>{
	// console.log(options)
})
octokit.hook.after('request', async (response: any, options: any)=>{
	// console.log(response, options)
})
octokit.hook.error('request', async (error: any, options: any)=>{
	console.log(options)
	new Notice(`${error}`)
	console.warn(error)
})

export const git_conf = {
	owner: 'lx-exhibition',
	author: {name: 'lx-exhibition', email: '1506218507@qq.com'},
	committer: {name: 'lx-exhibition', email: '1506218507@qq.com'},
	// repo: 'obsidian-vault'
}

export const rest = octokit.rest
export const git = octokit.rest.git
export const repos = octokit.rest.repos

export async function get_tree_items(repo: string, ref = 'heads/main'){
	if (!ref.startsWith('heads/') && !ref.startsWith('tags/')){
		ref = `heads/${ref}`
	}
	let branch_sha = (await git.getRef({...git_conf, repo, ref})).data.object.sha
	return (await git.getTree({...git_conf, repo, tree_sha: branch_sha, recursive: true})).data.tree
}
interface Data{ path: string, mode?: string, type?: string, sha?: string, size?: string, url?: string }
export interface Node{
	data: Data,
	childs: Node[]
}
export async function get_tree_rec(repo: string, ref = 'heads/main') {
	let items: Node[] = (await get_tree_items(repo, ref)).map((v: Data)=>({data: v, childs: []}))
	let map: Record<string, Node> = {'': {data: {path: ''}, childs: []}}
	items.forEach(v => map[v.data.path] = v)
	items.forEach(v =>{
		let path = '/' + v.data.path
		let idx = path.lastIndexOf('/')
		path = path.substring(1, idx ? idx : 1)
		map[path].childs.push(v)
	})
	return map['']
}

// interface Content{
// 	data: {
// 		type: "dir" | "file" | "submodule" | "symlink";
// 		size: number;
// 		name: string;
// 		path: string;
// 		content?: string;
// 		sha: string;
// 		url: string;
// 		git_url: string | null;
// 		html_url: string | null;
// 		download_url: string | null;
// 		_links: {
// 			git: string | null;
// 			html: string | null;
// 			self: string;
// 		}
// 	},
// 	childs?: Content[]
// }
// export async function get_tree(repo: string, ref = 'heads/main'){
// 	let get = async (path: string)=>{
// 		let ret: Content[] = []
// 		let res = (await repos.getContent({...git_conf,repo,path,ref})).data
// 		for (let i = 0; i < res.length; i++) {
// 			let v = res[i]
// 			if (v.type === 'dir'){
// 				ret.push({data: v, childs: await get(v.path)})
// 			}
// 			if (v.type === 'submodule'){
// 				ret.push({data: v})
// 			}
// 		}
// 		for (let i = 0; i < res.length; i++) {
// 			let v = res[i]
// 			if (v.type === 'file' || v.type === 'symlink'){
// 				ret.push({data: v})
// 			}
// 		}
// 		return ret
// 	}
// 	return await get('')
// }


