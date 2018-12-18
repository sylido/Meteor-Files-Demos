import { Template }    from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import Images          from '/lib/images.collection.js';
import bufferArray     from 'base64-arraybuffer';
import _               from 'lodash';
import './main.html';

Template.uploadedFiles.helpers({
  uploadedFiles: function () {
    return Images.find();
  }
});

Template.uploadForm.onCreated(function () {
  this.currentUpload = new ReactiveVar(false);
});

Template.uploadForm.helpers({
  currentUpload: function () {
    return Template.instance().currentUpload.get();
  }
});

Template.uploadForm.events({
  'change #fileInput': function (e, template) {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      // We upload only one file, in case
      // there were multiple files selected
      var file      = e.currentTarget.files[0],
          ownerId   = "unknownUser", // get the _id of the user uploading the file, default to the unknown user since we don't have user management
          password  = "aaabbb",
          saveDir   = `/uploadFiles/`; // will be created if it's missing in the root folder, files will go there

      if (file) {

        // reader will read the contents of the file
        var reader  = new FileReader(),
            raw     = "",
            empty   = "",
            partial = "",
            type    = "",
            rgx     = /data:(?:(.+));/i,
            rgx2    = /data:(?:(.+)),/;


        // define the callback that gets called when the reader finishes reading the contents of the file
        reader.onload = function() {
          // creater a web worker based on a file that includes crypto-js browserified to work on the client + containing your code
          var wrkr           = new Worker("/encFileMangled.js"),
              uploadInstance = "",
              cData         = "",
              fileName       = file.name; // get the name of the file, it needs to passed in to upload using base64 set to true

          raw = reader.result;

          // IE doesn't add anything to empty files
          if (!raw) {
            empty = true;
            raw   = "";
          } else {
            // For other browsers even empty files contain the string " data:" this is how we test for them
            if (/base64,$/ig.test(raw.substring(0, 100))) {
              empty = true;
            }
          }

          if (empty) {
            console.error("File is empty.");
            return;
          }

          // get the first 200 characters out of the file data stream
          partial = raw.substr(0, 200);
          // check if the string contains the regex - which is the data type of the file
          // if it's missing we set the type to an octet-stream
          type    =  _.get(partial.match(rgx), "[1]", "application/octet-stream");
          // remove the type from the partial including the comma(,) at the end
          partial = partial.replace(rgx2, "");
          // add the new type in front and append the rest of the file
          raw     = partial + raw.substr(200);
          // base64 to array buffer (it is a transferrable object, i.e. gets sent to web workers by reference)
          raw     = bufferArray.decode(raw);

          // send the raw file data and your chosen password to the web worker
          // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
          wrkr.postMessage([raw, password], [raw]);

          // set the callback to execute when the web worker is done with the encryption of the file and sends it back to the main thread
          wrkr.onmessage = function(eve) {
            // convert array buffer to base64 string
            cData = bufferArray.encode(eve.data.rawData);
            // console.log("encoded data = ", cData.substr(0, 200));
            // console.log("meta pwd = ", eve.data.pwd);

            // put the file metadata into the db collection Files
            uploadInstance = Images.insert({
              file      : cData,
              fileName  : fileName,
              type      : type,   // the type we have converted the file to is a binary octet
              isBase64  : true,   // that is why this is always set to true as well
              transport : "http", // we use http to transport the file faster
              streams   : 1,      // we use 1 stream to not mess up the encrypted file results
              chunkSize : 2 * 1024 * 1024, // each chunk size is 2 MB, larger chunks work, but at around 7-10MB they fail (bug)
              meta      : {
                path       : saveDir,             // directory where we want to save the file
                pwd        : eve.data.pwd,        // get the password used for the file (store it with the file encrypted, preference for this demo)
                owner      : ownerId,             // store the ID of the user uploading the file
                encrypted  : false,               // ideally you want to re-encrypt the file on the server side as it is ifinity times more secure
                uploadedAt : new Date().valueOf() // get the current timestamp in epoch format
              },
              onBeforeUpload    : function (currentFile) {
                // You can further check the the properties of the current file - i.e. extension, size after encryption
                // if the file doesn't meet the requirements return false to reject the upload
                return true;
              }
            }, false);

            uploadInstance.on('start', function() {
              template.currentUpload.set(this);
            });

            uploadInstance.on("end", function(error, fileObj) {
              // mark the upload as ready after 100ms in a separate JS thread with a timeout
              setTimeout(function() { template.currentUpload.set(false); }, 100);

              if (error) {
                window.alert('Error during upload: ' + error.reason);
              } else {
                window.alert('File "' + fileObj.name + '" successfully uploaded');
              }
            });

            uploadInstance.start();
          };
        };

        // start reading the file as an url
        reader.readAsDataURL(file);
      }
    }
  }
});
