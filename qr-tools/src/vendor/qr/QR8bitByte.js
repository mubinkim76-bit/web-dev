// Local adaptation: ES modules; UTF-8 byte encoding and ECI 26. 2026-10-01.
import QRMode from './QRMode.js';

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = new TextEncoder().encode(data);
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data[i], 8);
		}
	}
};

export default QR8bitByte;
