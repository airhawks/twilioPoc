'use strict';

var Video = require('twilio-video');

var crel = require('crel');
var $ = require('jquery');

var activeRoom;
var previewTracks;
var identity;
var roomName;
var isScreenShared = false;
var isAudioMuted = false;
var isVideoDisabled = false;
let screenLocalTrack;

// Attach the Tracks to the DOM.
function attachTracks(tracks, container) {
  tracks.forEach(function(track) {
    container.appendChild(track.attach());
  });
}

// Attach the Tracks to the DOM.
function attachScreenShareTrack(track, container) {
    let screenShare = track.attach();
    screenShare.classList.add('screenShare');
    container.appendChild(screenShare);
}

// Attach the Participant's Tracks to the DOM.
function attachParticipantTracks(participant, container) {
  var tracks = participant.tracks ? Array.from(participant.tracks.values()) : [];
  attachTracks(tracks, container);
}

// Detach the Tracks from the DOM.
function detachTracks(tracks) {
  tracks.forEach(function(track) {
    track.detach().forEach(function(detachedElement) {
      detachedElement.remove();
    });
  });
}

// Detach the Participant's Tracks from the DOM.
function detachParticipantTracks(participant) {
  var tracks = Array.from(participant.tracks.values());
  detachTracks(tracks);
}

function onAddParticipant(participant){
  var previewContainer = document.getElementById('remote-media');
  log("Joining: '" + participant.identity + "'");
  if(participant.tracks.size > 0){
    attachParticipantTracks(participant.tracks, previewContainer);
    logError("Tracks were already present", participant.tracks);
  }

  participant.on('trackSubscriptionFailed', 
    (error, trackPublication) => logError(`
      Failed to subscribe to RemoteTrack 
      ${trackPublication.trackSid} with name "${trackPublication.trackName}": ${error.message}
    `)
  );

  // When a Participant adds a Track, attach it to the DOM.
  participant.on('trackAdded', function(track) {
    log(participant.identity + " added track: " + track.kind);
    attachTracks([track], previewContainer);
  });

  // When a Participant removes a Track, detach it from the DOM.
  participant.on('trackRemoved', function(track) {
    log(participant.identity + " removed track: " + track.kind);
    detachTracks([track]);
  });

  // When a Participant leaves the Room, detach its Tracks.
  participant.on('disconnected', function() {
    log("Participant '" + participant.identity + "' left the room");
    detachParticipantTracks(participant);
  });
}

// When we are about to transition away from this page, disconnect
// from the room, if joined.
window.addEventListener('beforeunload', leaveRoomIfJoined);

// Obtain a token from the server in order to connect to the Room.
function getTokenAndJoinRoom(){
  let roomDetails = getRoomDetails();
  roomName = roomDetails.roomName;
  // var serverUrl = 'http://0.0.0.0:8080/';
  var serverUrl = 'https://twilio-video-twiliovideo.a3c1.starter-us-west-1.openshiftapps.com/';
  $.post(serverUrl + 'createRoom', {
    'roomId': roomName,
    'type': roomDetails.type
  }, function(data) {
    identity = data.identity;
      if (!roomName) {
        return;
      }
      log("Joining room '" + roomName + "'...");
      var connectOptions = {
        name: roomName,
        audio: false,
        video: false
      };
      // Join the Room with the token from the server
      Video.connect(data.token, connectOptions).then(roomJoined, function(error) {
        logError('Could not connect to Twilio: ' + error.message);
      });
    
  });
}

// Successfully connected!
function roomJoined(room) {
  window.room = activeRoom = room;

  log("Joined as '" + identity + "'");
  document.getElementById('mute-audio').style.display = "block";
  document.getElementById('disable-video').style.display = "block";
  checkForExtension();

  previewTracks.forEach(function(track){
    room.localParticipant.publishTrack(track).then(function(publication){
      log('Successfully published Track ', publication.trackSid);
    }).catch( error => {
      logError('Failed to publish Track!', error.message);
    })
  });
  
  // Attach LocalParticipant's Tracks, if not already attached.
  var previewContainer = document.getElementById('local-media');
  if (!previewContainer.querySelector('video')) {
    attachParticipantTracks(room.localParticipant, previewContainer);
  }

  // Attach the Tracks of the Room's Participants.
  room.participants.forEach(function(participant) {
    log("Already in Room: '" + participant.identity + "'");
    onAddParticipant(participant);
  });

  // When a Participant joins the Room, log the event.
  room.on('participantConnected', onAddParticipant);

  // Once the LocalParticipant leaves the room, detach the Tracks
  // of all Participants, including that of the LocalParticipant.
  room.on('disconnected', function() {
    log('Left');
    if (previewTracks) {
      previewTracks.forEach(function(track) {
        track.stop();
      });
    }
    detachParticipantTracks(room.localParticipant);
    room.participants.forEach(detachParticipantTracks);
    activeRoom = null;
  });
}

function startPreview(alreadyJoined) {
  var localTracksPromise = previewTracks
    ? Promise.resolve(previewTracks)
    : Video.createLocalTracks();

  return localTracksPromise.then(function(tracks) {
    window.previewTracks = previewTracks = tracks;
    var previewContainer = document.getElementById('local-media');
    if (!previewContainer.querySelector('video')) {
      attachTracks(tracks, previewContainer);
    }
    if(!alreadyJoined){
      getTokenAndJoinRoom();
    } 
    return tracks;
  }, function(error) {
    logError('Unable to access local media', error);
    log('Unable to access Camera and Microphone');
    return []
  });
}

Raven.config('https://2351e4c72ca04c2299eba88d9110b570@sentry.io/276620', {
  sampleRate: 1,
  autoBreadcrumbs: {
      'xhr': true,      // XMLHttpRequest
      'console': true,  // console logging
      'dom': true,       // DOM interactions, i.e. clicks/typing
      'location': true,  // url changes, including pushState/popState
      'sentry': true     // sentry events
  }
}).install();

// Preview LocalParticipant's Tracks.
window.addEventListener('load', 
Raven.context(function () {
  startPreview();
}));

// Activity log.
function log() {
  let args = Array.from(arguments);
  console.log("LocalLog -> ", ... args);
  // var logDiv = document.getElementById('log');
  // logDiv.innerHTML += '<p>&gt;&nbsp;' + message + '</p>';
  // logDiv.scrollTop = logDiv.scrollHeight;
}
function logError(){
  let args = Array.from(arguments);
  console.error("LocalLog -> ", ... args);
}


// Leave Room.
function leaveRoomIfJoined() {
  if (activeRoom) {
    activeRoom.disconnect();
  }
}

const EXTENSION_ID = "dfpnbmkkagkknpnmaajhggpedcnfpomg";
const { connect, LocalVideoTrack } = Video;

function checkForExtension(){
  if(window.checkChromeExtension() || window.electron ){
    document.getElementById('share-screen').style.display = "block";
    document.getElementById('install-button').style.display = "none";
  }else{
    document.getElementById('share-screen').style.display = "none";
    document.getElementById('install-button').style.display = "block";
  }
}

document.getElementById('mute-audio').onclick = function() {
  var muteAudioBtn = this;
  isAudioMuted = !isAudioMuted;
  muteAudioBtn.textContent = isAudioMuted ? "UnMute Audio": "Mute Audio";
  room.localParticipant.audioTracks.forEach(function(track){
    if(isAudioMuted){
      track.disable();
    } else{
      track.enable();
    }
  });
}


document.getElementById('disable-video').onclick = function() {
  var muteAudioBtn = this;
  isVideoDisabled = !isVideoDisabled;
  muteAudioBtn.textContent = isVideoDisabled ? "Enable Video": "Disable Video";

  room.localParticipant.videoTracks.forEach(function(track){
    if(screenLocalTrack && track.id === screenLocalTrack.id){
      return;
    }
    if(isVideoDisabled){
      track.disable();
    } else{
      track.enable();
    }
  });
}
var shareScreenBtn = document.getElementById('share-screen');

document.getElementById('share-screen').onclick = window.startScreenShare = function startScreenShare() {
  isScreenShared = !isScreenShared;
  shareScreenBtn.disabled = true;
  if(!isScreenShared){
    screenLocalTrack.stop();
    return;
  }
  getUserScreen(['window', 'screen', 'tab'], EXTENSION_ID)
  .then(returnedStream => {
      log(returnedStream);
      log(returnedStream.getVideoTracks()[0]);
      screenLocalTrack = new LocalVideoTrack(returnedStream.getVideoTracks()[0]);

      screenLocalTrack.once('stopped', function(){
        isScreenShared = false;
        stopScreenShare(shareScreenBtn);
      });

      room.localParticipant.publishTrack(screenLocalTrack);  
      attachScreenShareTrack(screenLocalTrack, document.getElementById('local-media'));
      shareScreenBtn.disabled = false;
      shareScreenBtn.textContent = "Stop Sharing";
    }).catch(err => {
      isScreenShared = !isScreenShared;
      shareScreenBtn.disabled = false;
      logError('Could not get stream: ', err);
    });
}

function getUserScreen(sources, extensionId) {
  const request = {
    type: 'getUserScreen',
    sources: sources
  };

  
  return new Promise((resolve, reject) => {
    let electron = window.electron;
    if(electron && electron.desktopCapturer){ 
      electron.desktopCapturer.getSources({types: ['window', 'screen']}, (error, sources) => {
        if (error) 
          reject(new Error(error));
        simpleSelector(sources, function(error, sourceId, metadata) {
          if(error)
            reject(new Error(error));
          log("Selected Screen " + sourceId);
          resolve(sourceId);
        });
      });
    }else {
      chrome.runtime.sendMessage(extensionId, request, response => {
        switch (response && response.type) {
          case 'success':
            resolve(response.streamId);
            break;
  
          case 'error':
            reject(new Error(response));
            logError("Error in getUserMedia"+ (response && response.message));
            break;
  
          default:
            reject(new Error('Unknown response'));
            break;
        }
      });
    }
  }).then(streamId => {
    return navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          // You can provide additional constraints. For example,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 10,
          minAspectRatio: 1.77
        }
      }
    });
  });
}

function stopScreenShare(shareScreenBtn){
  try{
    
  room.localParticipant.unpublishTrack(screenLocalTrack);
  detachTracks([screenLocalTrack]);
  shareScreenBtn.disabled = false;
  shareScreenBtn.textContent = "Share Screen";
  }
  catch(e){
    throw new Error(e);
  } 
}

function emptyLocalMedia(){
  var myNode = document.getElementById("local-media");
  while (myNode.firstChild) {
      myNode.removeChild(myNode.firstChild);
  }
}

function getRoomDetails(){
  var urlData = {};
  try{

    var search = location.search.substring(1);
    var params = JSON.parse('{"' + decodeURI(search).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
    urlData.roomName = params.roomId;
    urlData.type = params.type === 'peer' ? 'peer': 'group';
  }
  catch(e){
    logError("Incorrect url params!!!");
  }
  return urlData;
}





let bugDetailsInput = document.getElementById('bug-details'),
  sendReportBtn = document.getElementById('send-report'),
  reportBugBtn = document.getElementById('report-bug');

reportBugBtn.onclick = function() {
  sendReportBtn.style.display = "block";
  bugDetailsInput.style.display = "block";
  
  reportBugBtn.style.display = "none";
};

sendReportBtn.onclick = function() {
  reportBugBtn.style.display = "block";

  sendReportBtn.style.display = "none";
  bugDetailsInput.style.display = "none";
  let message = bugDetailsInput.value;
  bugDetailsInput.value = '';
  Raven.captureException(new Error(message));
};


function simpleSelector(sources, callback) {

  var options = crel('select', {
    style: 'margin: 0.5rem'
  }, sources.map(function(source) {
    return crel('option', {id: source.id, value: source.id}, source.name);
  }));

  var selector = crel('div',
    {
      style: 'position: absolute; padding: 1rem; z-index: 999999; background: #ffffff; width: 100%; font-family: \'Lucida Sans Unicode\', \'Lucida Grande\', sans-serif; box-shadow: 0px 2px 4px #dddddd;'
    },
    crel('label', { style: 'margin: 0.5rem' }, 'Share screen:'),
    options,
    crel('span', { style: 'margin: 0.5rem; display: inline-block' },
      button('Share', function() {
        close();
        var selected = sources.filter(function(source) {
          return source && source.id === options.value;
        })[0];
        return callback(null, options.value, { title: selected.name });
      }),
      button('Cancel', close)
    )
  );

  function button(text, fn) {
    var button = crel('button', {
      style: 'background: #555555; color: #ffffff; padding: 0.5rem 1rem; margin: 0rem 0.2rem;'
    }, text);
    button.addEventListener('click', fn);
    return button;
  }

  function close() {
    document.body.removeChild(selector);
  }

  document.body.appendChild(selector);
}
