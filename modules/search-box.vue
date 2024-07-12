<script setup lang="ts">
import {defineProps} from 'vue'
import MyPlugin from 'main'
let props = defineProps(['ob'])
let ob = props.ob as MyPlugin

import {onMounted} from 'vue'
console.log(ob)
onMounted(()=>{
	const searchBox = document.getElementById('searchBox')
	searchBox.style.left = '50px'
	searchBox.style.top = '50px'

	ob.registerDomEvent(searchBox, 'mousedown', (e)=>{
		let px = parseInt(searchBox.style.left.substring(0,searchBox.style.left.length-2))
		let py = parseInt(searchBox.style.top.substring(0,searchBox.style.top.length-2))

		const mouseMoveHandler = (e1: MouseEvent) => {
			searchBox.style.left = `${px + e1.clientX-e.clientX}px`;
			searchBox.style.top = `${py + e1.clientY-e.clientY}px`;
		}

		ob.registerDomEvent(document,'mousemove',mouseMoveHandler)
		ob.registerDomEvent(document, 'mouseup', ()=>{
			document.removeEventListener('mousemove', mouseMoveHandler)
		}, { once: true })
		document.getElementById('close').onclick
	})

})
</script>

<template>
	<div class="floating-search-box" id="searchBox" tabindex="-1">
		<div style="display: flex;flex-direction: row">
			<input type="text" class="search-input" placeholder="Search...">
			<span class="close" id="close" tabindex="-1">X</span>
		</div>
	</div>
</template>

<style scoped>
.floating-search-box {
	position: fixed;
	top: 50px; left: 50px; width: 225px; height: 150px;
	padding: 10px; border: 1px solid #ccc;
	background-color: #f6f6f6;
	box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
	z-index: 1000;
	cursor: move;
	border-radius: 10px;
}
.search-input{}
.close{width: 30px; text-align: center; margin: auto; border-radius: 5px}
.close:hover{background-color: red;color: mintcream; cursor: default}
.close:active{background-color: #aa0000; cursor: default}
</style>
