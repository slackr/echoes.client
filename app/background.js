/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('view/ui.html', {
    id: 'echoes-encrypted-messenger',
    frame: {
        type: "none"
    },
    outerBounds: {
      'width': 500,
      'height': 600
    }
  });
});
