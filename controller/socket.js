/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Socket controller that handles talking to server backend
 * Also sets up event handlers
 *
 * @class
 * @extends EchoesObject
 */
function EchoesSocket() {
    EchoesObject.call(this, 'socket');
}
EchoesSocket.prototype = Object.create(EchoesObject.prototype);
EchoesSocket.prototype.constructor = EchoesSocket;

