/* global chrome */
/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Wrapper for different storage implementations
 *
 * @class
 * @extends EchoesObject
 */
function EchoesStorage() {
    EchoesObject.call(this, 'storage');

    /**
     * Storage type to use
     *
     * 'chrome','dom','firefox'?
     *
     * Set automatically by get_store()
     */
    this.store_type = 'dom';
    this.store = null;
}
EchoesStorage.prototype = Object.create(EchoesObject.prototype);
EchoesStorage.prototype.constructor = EchoesStorage;

/**
 * Determine the storage object to use
 *
 * Will use DOM storage by default
 *
 * @see AppConfig#USE_SYNC_STORAGE
 */
EchoesStorage.prototype.get_store = function() {
    if (typeof chrome != 'undefined'
        && typeof chrome.storage != 'undefined') {
        this.store_type = 'chrome';
        this.store = (AppConfig.USE_SYNC_STORAGE ? chrome.storage.sync : chrome.storage.local);
        this.log('found chrome storage', 0);
    } else {
        this.store_type = 'dom';
        this.store = localStorage;
        this.log('using DOM storage', 0);
    }
};

/**
 * (async) Set a value in storage
 *
 * @param   {string} key            Key to store value under
 * @param   {object} value          Value object to store, DOM only supports strings
 * @param   {function} callback     (optional) Function to callback on completion
 *
 * @returns {null}
 */
EchoesStorage.prototype.set = function(key, value, callback) {
    if (! this.store) {
        this.get_store();
    }

    switch(this.store_type) {
        case 'chrome':
            var obj = {};
            obj[key] = value;
            this.store.set(obj, callback);
        break;
        case 'dom':
            this.store.setItem(key, value);
            if (typeof callback == 'function') {
                callback();
            }
        break;
    }
};

/**
 * (async) Get a key value from storage
 *
 * The callback function will be called with the first parameter
 * being an object[key] = value;
 *
 * @param   {string} key            Key to retrieve from storage
 * @param   {function} callback     Function to call back with parameter containing the key-value pair retrieved
 *
 * @returns {null}
 */
EchoesStorage.prototype.get = function(key, callback) {
    if (! this.store) {
        this.get_store();
    }

    switch(this.store_type) {
        case 'chrome':
            this.store.get(key, callback);
        break;
        case 'dom':
            var obj = {};
            obj[key] = this.store.getItem(key);
            callback(obj);
        break;
    }
};

/**
 * (async) Remove key from storage
 *
 * @param   {string} key    Key to retrieve from storage
 * @param   {function} callback      (optional) Function to callback when removal finishes
 *
 * @returns {null}
 */
EchoesStorage.prototype.remove = function(key, callback) {
    if (! this.store) {
        this.get_store();
    }

    switch(this.store_type) {
        case 'chrome':
            this.store.remove(key, callback);
        break;
        case 'dom':
            this.store.removeItem(key);
            if (typeof callback == 'function') {
                callback();
            }
        break;
    }
};

/**
 * Clear all keys from storage
 *
 * @param   {function} callback     (optional) Function to call when clearing is complete
 *
 * @returns {null}
 */
EchoesStorage.prototype.clear = function(callback) {
    if (! this.store) {
        this.get_store();
    }

    switch(this.store_type) {
        case 'chrome':
            this.store.clear(callback);
        break;
        case 'dom':
            this.store.clear();
            if (typeof callback == 'function') {
                callback();
            }
        break;
    }

    this.log('storage of type: ' + this.store_type + ' was cleared', 1);
};
