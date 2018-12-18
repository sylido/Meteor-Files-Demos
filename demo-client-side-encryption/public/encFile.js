// run the following in the public folder
//     watchify encFile.js -o "uglifyjs -cm > encFileMangled.js"
// this watches this file for changes, compresses and mangles it into the encFileMangled.js which becomes the web worker we use
// you would need to install watchify, browserify and uglifyjs globally to run the above command

onmessage = function(e) {
  var b64ab = require("base64-arraybuffer"),
      cryp  = require("crypto-js"),
      data  = e.data[0], // file data
      pwd   = e.data[1]; // password

  // transforms the arraybuffer into a base64 string
  data = b64ab.encode(data);
  data = cryp.AES.encrypt(data, pwd).toString();
  // make an array buffer from the string
  // otherwise throws out of memory exceptions for large files (under IE only)
  data = b64ab.decode(data);

  postMessage({ rawData : data });
};
