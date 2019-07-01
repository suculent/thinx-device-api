//
// Sample tag byte->float parser
// Expected value is 0xbaXXXXXXXX where XXXXXXXX are 4 bytes float battery voltage
// (You may decide on your own tag length or structure, this is just an example.)
//

var transformer = function(status, device) {

  //
  // Convenience functions
  //

  // Convert between endians
  var flipHexString = function(hexValue, hexDigits) {
    var h = hexValue.substr(0, 2);
    for (var i = 0; i < hexDigits; ++i) {
      h += hexValue.substr(2 + (hexDigits - 1 - i) * 2, 2);
    }
    return h;
  };

  // Convert hexadecimal value to float
  var hexToFloat = function(hex) {
    var s = hex >> 31 ? -1 : 1;
    var e = (hex >> 23) & 0xFF;
    return s * (hex & 0x7fffff | 0x800000) * 1.0 / Math.pow(2, 23) * Math.pow(2, (e - 127));
  };

  // Check the prefix for 'ba'
  const tag = ststr.substr(0, 2); // start, length
  var icon = "";
  if (tag == "ba") {
    const hex_voltage = ststr.substr(2, ststr.length - 2);
    const voltage = hexToFloat(flipHexString("0x" + hex_voltage, 8));
    if (voltage < 3.4) {
      icon = "#!"; // show yellow warning sign when battery is bellow specified level
    }
    return "Battery " + voltage + " V" + icon;
  } else {
    return status; // in case return value is undefined, original status will be displayed
  }

};
