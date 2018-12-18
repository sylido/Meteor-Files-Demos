import { Meteor }          from 'meteor/meteor';
import { FilesCollection } from 'meteor/ostrio:files';

let fs, aes, cryp;

// run this code on the server only
if (Meteor.isServer) {
  fs   = Npm.require('fs-extra');
  aes  = Npm.require('crypto-js/aes');
  cryp = Npm.require('crypto-js/x64-core');
}

const Images = new FilesCollection({
  debug           : true,
  collectionName  : 'Images',
  allowClientCode : false, // Disallow remove files from Client
  storagePath     : function(fileObj) {
    var dirToSave = "";

    // try to get the storage path from the client, can be hardcoded here
    if (fileObj && typeof fileObj.meta === "undefined") {
      fileObj.meta = { path : "/" };
    }

    dirToSave = fileObj.meta.path;

    if (Meteor.isServer) {
      // ensure the directory exists before we return it to the library
      fs.ensureDirSync(dirToSave);
    }

    return dirToSave;
  },
  onBeforeUpload  : function (file) {
    // Allow upload files under 10MB, and only in png/jpg/jpeg formats
    if (file.size <= 1024 * 1024 * 10 && /png|jpe?g/i.test(file.extension)) {
      return true;
    }
    return 'Please upload image, with size equal or less than 10MB';
  },
  interceptDownload : function(http, fileRef) {
    if (Meteor.isServer) {
      var password = 'aaabbb', // password we used on the client side, you would think of a way to store this securely in the user's account
          fileData = '',
          buf      = '';

      console.log("fileRef = ", fileRef);
      // if the file has a path
      if (fileRef.path) {
        // read the file, assume the file is stored using Base64 encoding
        fileData = fs.readFileSync(fileRef.path, { encoding : "base64" }); // "utf8"
        // decrypt the file using the password, stringify it with UTF8
        fileData = cryp.enc.Utf8.stringify(aes.decrypt(fileData, password));
        // parse the resulting file data into a Base64 word array, then stringify it to a Base64 string
        fileData = cryp.enc.Base64.stringify(cryp.enc.Base64.parse(fileData));
        // make the data into a buffer from a Base64 string
        buf      = Buffer.from(fileData, 'base64');

        // respond to the http request to download the file by giving the name of the file and setting the type to the octet-stream one
        http.response.writeHead(200, {
          "Content-Disposition" : "attachment; filename=" + fileRef.name,
          "Content-Type"        : "application/octet-stream"
        });

        // finally send the decrypted file back to the client side
        http.response.end(buf);

        // done
        return true;
      }

      // if it's not the server side calling this, do nothing
      return false;
    }

    return false;
  }
});

if (Meteor.isServer) {
  Images.denyClient();
  Meteor.publish('files.images.all', function () {
    return Images.find().cursor;
  });
} else {
  Meteor.subscribe('files.images.all');
}

export default Images;
