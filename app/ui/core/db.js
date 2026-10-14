import {  Database } from '../utils/utils.js';
import { SCRN_DB_NAME, SCRN_DB_PATH,
  CACHE_DB_NAME, CACHE_DB_PATH
} from '../configs/configs.js';

const screenerDBObj = new Database(SCRN_DB_NAME, SCRN_DB_PATH);
const cacheDBObj = new Database(CACHE_DB_NAME, CACHE_DB_PATH);

export const screenerDB = {
  getAllSavedResults: getAllSavedResults.bind(screenerDBObj),
  getAllSavResTitles: getAllSavResTitles.bind(screenerDBObj),
  saveResult: saveResult.bind(screenerDBObj),
  getSavedResult: getSavedResult.bind(screenerDBObj),
  deleteResult: deleteResult.bind(screenerDBObj)
};

export const cacheDB = 
{
  getSavedResult: getSavedResult.bind(cacheDBObj),
  saveResult: saveResult.bind(cacheDBObj),
  deleteAllResults: clearDatabase.bind(cacheDBObj)
}


async function getAllSavResTitles()  
{
  const entries = await this.getAll();
  return entries.map(entry => entry.meta.title);
}



async function getAllSavedResults()  
{
  return this.getAll();	
}

async function saveResult(entry)   
{
	return this.save(entry);
}

async function getSavedResult(key)
{
	
	return this.get(key);
	
}
async function deleteResult(key)
{
	
	return this.delete(key);
}
async function clearDatabase()
{
    return this.clear();
}
