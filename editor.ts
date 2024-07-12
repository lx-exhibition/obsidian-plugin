import {ViewUpdate, ViewPlugin, PluginValue, EditorView} from '@codemirror/view'
import {EditorState, StateEffect, StateField, Transaction, ChangeSpec} from '@codemirror/state'

let changes: ChangeSpec[] = [
	{from: 0, insert: 'Heading'},
	{from: 0, insert: '# '},
	{from: 0, insert: '#'},
]


let addEffect = StateEffect.define<number>()
let subEffect = StateEffect.define<number>()
let resetEffect = StateEffect.define()
export const calculatorField = StateField.define<number>({
	create(st: EditorState): number{
		return 0;
	},
	update(old_st: number, transaction: Transaction): number{
		let new_st = old_st
		for (let effect of transaction.effects){
			if (effect.is(addEffect)){
				new_st += effect.value
			}else if (effect.is(subEffect)){
				new_st -= effect.value
			}else if (effect.is(resetEffect)){
				new_st = 0
			}
		}
		return new_st
	}
})

export function add(view: EditorView, num: number){
	view.dispatch({
		effects: [addEffect.of(num)]
	})
}
export function sub(view: EditorView, num: number){
	view.dispatch({
		effects: [subEffect.of(num)]
	})
}
export function reset(view: EditorView, num: number){
	view.dispatch({
		effects: [resetEffect.of(null)]
	})
}

class MyPlugin implements PluginValue{
	constructor(view: EditorView) {

	}

	update(update: ViewUpdate) {

	}

	destroy() {

	}
}

export const myPlugin = ViewPlugin.fromClass(MyPlugin)
