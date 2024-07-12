import axios from "axios"

let http = axios.create({
	headers: {}
})
http.defaults.baseURL = 'http://localhost:8765/'
// http.interceptors.response.use((res)=>res.data)

export default http

type CardAction = 'getEaseFactors' | 'setEaseFactors' | 'setSpecificValueOfCard' | 'suspend' | 'unsuspend' |
	'suspended' | 'areSuspended' | 'areDue' | 'getIntervals' | 'findCards' | 'cardsToNotes' | 'cardsModTime' |
	'cardsInfo' | 'forgetCards' | 'relearnCards' | 'answerCards'
type DeckAction = 'deckNames' | 'deckNamesAndIds' | 'getDecks' | 'createDeck' | 'changeDeck' | 'deleteDecks' |
	'getDeckConfig' | 'saveDeckConfig' | 'setDeckConfigId' | 'cloneDeckConfigId' | 'removeDeckConfigId' |
	'getDeckStats'
type GraphicalAction = 'guiBrowse' | 'guiSelectNote' | 'guiSelectedNotes' | 'guiAddCards' | 'guiEditNote' |
	'guiCurrentCard' | 'guiStartCardTimer' | 'guiShowQuestion' | 'guiShowAnswer' | 'guiAnswerCard' | 'guiUndo' |
	'guiDeckOverview' | 'guiDeckBrowser' | 'guiDeckReview' | 'guiImportFile' | 'guiExitAnki' | 'guiCheckDatabase'
type MediaAction = 'storeMediaFile' | 'retrieveMediaFile' | 'getMediaFilesNames' | 'getMediaDirPath' | 'deleteMediaFile'
type MiscellaneousAction = 'requestPermission' | 'version' | 'apiReflect' | 'sync' | 'getProfiles' | 'loadProfile' |
	'multi' | 'exportPackage' | 'importPackage' | 'reloadCollection'
type ModelAction = 'modelNames' | 'modelNamesAndIds' | 'findModelsById' | 'findModelsByName' | 'modelFieldNames' |
	'modelFieldDescriptions' | 'modelFieldFonts' | 'modelFieldsOnTemplates' | 'createModel' | 'modelTemplates' |
	'modelStyling' | 'updateModelTemplates' | 'updateModelStyling' | 'findAndReplaceInModels' | 'modelTemplateRename' |
	'modelTemplateReposition' | 'modelTemplateAdd' | 'modelTemplateRemove' | 'modelFieldRename' | 'modelFieldReposition' |
	'modelFieldAdd' | 'modelFieldRemove' | 'modelFieldSetFont' | 'modelFieldSetFontSize' | 'modelFieldSetDescription'
type NoteAction = 'addNote' | 'addNotes' | 'canAddNotes' | 'canAddNotesWithErrorDetail' | 'updateNoteFields' |
	'updateNote' | 'updateNoteModel' | 'updateNoteTags' | 'getNoteTags' | 'addTags' | 'removeTags' | 'getTags' |
	'clearUnusedTags' | 'replaceTags' | 'replaceTagsInAllNotes' | 'findNotes' | 'notesInfo' | 'deleteNotes' |
	'removeEmptyNotes'
type StatisticAction = 'getNumCardsReviewedToday' | 'getNumCardsReviewedByDay' | 'getCollectionStatsHTML' | 'cardReviews' |
	'getReviewsOfCards' | 'getLatestReviewID' | 'insertReviews'
type Action = CardAction | DeckAction | GraphicalAction | MediaAction | MiscellaneousAction | ModelAction | NoteAction | StatisticAction

interface CardParam{

}
interface DeckParam{

}
interface GraphicalParam{

}
interface MediaParam{
	filename?: string, data?: string, path?: string, url?: string
}
interface MiscellaneousParam{

}
interface ModelParam{
	modelIds?: number[], modelNames?: string[], modelName?: string, model?: string,
	oldTemplateName?: string, newTemplateName?: string, templateName?: string, template?: { [k: string]: string }
	oldFieldName?: string, newFieldName?: string, fieldName?: string, index?: string,
	font?: string, fontSize?: string, description?: string
}
interface Note{
	deckName: string,
	modelName: string,
	fields: { [field: string]: string },
	options?: {
		allowDuplicate: boolean,
		duplicateScope: string,
		duplicateScopeOptions: { deckName: string, checkChildren: boolean, checkAllModels: boolean }
	},
	tags?: string[],
	audio?: MediaParam[], video?: MediaParam[], picture?: MediaParam[]
}
interface NoteParam{
	note?: Note, notes?: Note[]
}
interface StatisticParam{

}
export interface Params extends CardParam, DeckParam, GraphicalParam, MediaParam,
	MiscellaneousParam, ModelParam, NoteParam, StatisticParam {}

export const req = async (action: Action | string, params: Params={}, version: number=0, key: string | null = null)=>{
	let data = { action, params, version, key}
	return (await http.post('', data)).data
}

