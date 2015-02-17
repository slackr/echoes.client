/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Parent class that handles logging and whatnot
 *
 * @class
 */

/**
 * Constructor initializes logging capabilities
 *
 * Child objects can call this constructor with a component name
 * This name will be added to log entries
 *
 * @param   {string} component The component name chosen by client
 *
 * @returns {null}
 */
function EchoesObject(component) {
    this.log_levels = {
        0: 'debug',
        1: 'info',
        2: 'warn',
        3: 'error',
    }
    this.component = component + '';
}

/**
 * Add log entry to either console or log_entries array
 *
 * If AppConfig.CONSOLE_LOG is true, log entris will be added to this.log_entries
 * This might be a memory hog on apps with long life cycles.
 *
 * Default level = '1'
 *
 * @param   {string} msg    Message to add to log
 * @param   {integer} level (default='1') Message criticality
 *
 * @returns {null}
 */
EchoesObject.prototype.log = function(msg, level) {
    level = (typeof level != 'undefined' ? level : 1);

    //if (typeof msg != 'string') {
    //    msg = JSON.stringify(msg);
    //}

    if (level >= AppConfig.LOG_LEVEL) {
        var timestamp = new Date().toLocaleString();
        var entry = timestamp + ' - ' + (this.component ? this.component.toLowerCase() + ' - ' : '') + this.log_levels[level] + ': ' + msg;

        if (level >= 3) {
            console.error(entry);
        } else {
            console.log(entry);
        }
    }
}
