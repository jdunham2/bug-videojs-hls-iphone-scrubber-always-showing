// Import stylesheets
import "./style.css";
import videojs from "video.js";

var options = {
  controls: true,
  autoplay: true,
  preload: "auto",
  liveui: true,
  liveTracker: {
    /**
     * Minimum amount of seconds of live playlist duration
     * in order to display the live UI with scrub bar.
     *
     * On Desktop No scrubber is present
     * On iPhone it is there.
     */
    trackingThreshold: 60
  },
  html5: {
    hls: {
      // When this option is set to true,
      // in Safari there is an issue with
      // live streams where the player starts
      // playing from position zero instead of
      // from live position.
      overrideNative: false
    }
  },
  techOrder: ["html5"]
};

var isPlayerReady = false;

var player = videojs("videoPlayer", options, function onPlayerReady() {
  videojs.log("Player is ready!");
  isPlayerReady = true;
});

function play() {
  if (isPlayerReady === false) {
    alert("The player is not ready yet.");
    return;
  }
  var urlInputElement = document.getElementById("urlInput");
  var url = urlInputElement.value;
  var contentType = "video/mp4";
  if (url.includes(".m3u8")) {
    contentType = "application/x-mpegURL";
  }
  player.src({ type: contentType, src: url });
  player.on("ready", function() {
    player.play();
  });
}

document.getElementById("playButton").addEventListener("click", play);
