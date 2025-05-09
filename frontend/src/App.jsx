import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io(import.meta.env.VITE_BACKEND_URL);

const App = () => {
  const [myId, setMyId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [inputId, setInputId] = useState("");
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const pendingCandidates = useRef([]);

  useEffect(() => {
    socket.on("connect", () => {
      setMyId(socket.id);
    });

    socket.on("offer", async ({ offer, from }) => {
      await createPeerConnection(from, false);
      if (!peerConnection.current.currentRemoteDescription) {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        await applyPendingCandidates();
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("answer", { answer, to: from });
      }
    });

    socket.on("answer", async ({ answer, from }) => {
      if (!peerConnection.current.currentRemoteDescription) {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        await applyPendingCandidates();
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (peerConnection.current?.remoteDescription?.type) {
        try {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (err) {
          console.error("Failed to add ICE candidate", err);
        }
      } else {
        pendingCandidates.current.push(candidate);
      }
    });
  }, []);

  const applyPendingCandidates = async () => {
    for (const c of pendingCandidates.current) {
      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.error("Error applying queued ICE", err);
      }
    }
    pendingCandidates.current = [];
  };

  const createPeerConnection = async (target, isCaller) => {
    if (peerConnection.current) return;

    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:relay1.expressturn.com:3478",
          username: "expressturn",
          credential: "webrtc",
        },
      ],
    });

    peerConnection.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", { candidate: e.candidate, to: target });
      }
    };

    peerConnection.current.ontrack = (e) => {
      remoteRef.current.srcObject = e.streams[0];
    };

    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: isVideoOn,
      audio: isAudioOn,
    });
    localRef.current.srcObject = localStream.current;
    localStream.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStream.current);
    });

    if (isCaller) {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      socket.emit("offer", { offer, to: target });
    }
  };

  const handleConnect = async () => {
    setTargetId(inputId.trim());
    await createPeerConnection(inputId.trim(), true);
    setIsCallActive(true);
  };

  const handleEndCall = () => {
    peerConnection.current.close();
    setIsCallActive(false);
    localStream.current.getTracks().forEach((track) => track.stop());
    setTargetId("");
    setInputId("");
  };

  const handleToggleVideo = () => {
    const videoTrack = localStream.current.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoOn(videoTrack.enabled);
  };

  const handleToggleAudio = () => {
    const audioTrack = localStream.current.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setIsAudioOn(audioTrack.enabled);
  };

  return (
    <div className="app-container">
      <h2>WebRTC Video Call</h2>
      <p className="user-id">Your ID: {myId}</p>

      {!isCallActive ? (
        <div className="call-input">
          <input
            type="text"
            placeholder="Enter other user's Socket ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          />
          <button className="call-button" onClick={handleConnect}>
            Start Call
          </button>
        </div>
      ) : (
        <div className="call-actions">
          <button className="video-control" onClick={handleToggleVideo}>
            {isVideoOn ? "Turn Video Off" : "Turn Video On"}
          </button>
          <button className="audio-control" onClick={handleToggleAudio}>
            {isAudioOn ? "Mute Audio" : "Unmute Audio"}
          </button>
          <button className="end-call" onClick={handleEndCall}>
            End Call
          </button>
        </div>
      )}

      <div className="video-container">
        <div className="video-box">
          <h4>📹 Local Video</h4>
          <video ref={localRef} autoPlay muted playsInline />
        </div>
        <div className="video-box">
          <h4>📞 Remote Video</h4>
          <video ref={remoteRef} autoPlay playsInline />
        </div>
      </div>
    </div>
  );
};

export default App;
