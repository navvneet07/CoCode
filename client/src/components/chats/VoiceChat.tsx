import { useCallback, useEffect, useRef, useState } from "react"
import { useSocket } from "@/context/SocketContext"
import { useAppContext } from "@/context/AppContext"
import { SocketEvent } from "@/types/socket"

const STUN_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }

type PeerEntry = {
    pc: RTCPeerConnection
    audioEl: HTMLAudioElement
    muted: boolean
}

const VoiceChat = () => {
    const { socket } = useSocket()
    const { users } = useAppContext()

    const localStreamRef = useRef<MediaStream | null>(null)
    // map of remoteSocketId -> PeerEntry
    const peersRef = useRef<Record<string, PeerEntry>>({})

    const [joined, setJoined] = useState(false)
    const [localMuted, setLocalMuted] = useState(false)
    // track per-peer mute in state so UI updates reliably
    const [remoteMutedMap, setRemoteMutedMap] = useState<Record<string, boolean>>({})
    // container ref to append audio elements so playback works
    const audioContainerRef = useRef<HTMLDivElement | null>(null)

    // helper to create per-peer RTCPeerConnection
    const createPeerConnection = useCallback(async (remoteSocketId: string) => {
        const pc = new RTCPeerConnection(STUN_CONFIG)

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit(SocketEvent.VOICE_ICE_CANDIDATE, { candidate: e.candidate, targetSocketId: remoteSocketId })
            }
        }

    const audioEl = document.createElement("audio")
    audioEl.autoplay = true
    audioEl.setAttribute("playsinline", "")
    audioEl.controls = false
    // append to container so it becomes part of document and can play audio reliably
    if (audioContainerRef.current) audioContainerRef.current.appendChild(audioEl)

        pc.ontrack = (e) => {
            audioEl.srcObject = e.streams[0]
        }

        // Add local tracks
        if (!localStreamRef.current) {
            try {
                localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
            } catch (err) {
                console.error("Microphone access denied", err)
                throw err
            }
        }
        localStreamRef.current!.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!))

        peersRef.current[remoteSocketId] = { pc, audioEl, muted: false }
        // initialize remote mute state
        setRemoteMutedMap((m) => ({ ...m, [remoteSocketId]: false }))
        return peersRef.current[remoteSocketId]
    }, [socket])

    // Cleanup peers
    const cleanupPeer = useCallback((socketId: string) => {
        const entry = peersRef.current[socketId]
        if (!entry) return
        try {
            entry.pc.close()
        } catch {}
        try {
            entry.audioEl.srcObject = null
            if (entry.audioEl.parentNode) entry.audioEl.parentNode.removeChild(entry.audioEl)
        } catch {}
        delete peersRef.current[socketId]
        setRemoteMutedMap((m) => {
            const copy = { ...m }
            delete copy[socketId]
            return copy
        })
    }, [])

    useEffect(() => {
        // Offer received: create pc for the sender, set remote desc, create answer
        const handleOffer = async ({ offer, senderSocketId }: any) => {
            try {
                const entry = await createPeerConnection(senderSocketId)
                await entry.pc.setRemoteDescription(new RTCSessionDescription(offer))
                const answer = await entry.pc.createAnswer()
                await entry.pc.setLocalDescription(answer)
                socket.emit(SocketEvent.VOICE_ANSWER, { answer, targetSocketId: senderSocketId })
            } catch (err) {
                console.error("Failed handling offer", err)
            }
        }

        const handleAnswer = async ({ answer, senderSocketId }: any) => {
            const entry = peersRef.current[senderSocketId]
            if (!entry) return
            try {
                await entry.pc.setRemoteDescription(new RTCSessionDescription(answer))
            } catch (err) {
                console.warn("Failed to set remote answer", err)
            }
        }

        const handleIce = async ({ candidate, senderSocketId }: any) => {
            const entry = peersRef.current[senderSocketId]
            if (!entry) return
            try {
                await entry.pc.addIceCandidate(new RTCIceCandidate(candidate))
            } catch (err) {
                console.warn("Failed to add ICE candidate", err)
            }
        }

        socket.on(SocketEvent.VOICE_OFFER, handleOffer)
        socket.on(SocketEvent.VOICE_ANSWER, handleAnswer)
        socket.on(SocketEvent.VOICE_ICE_CANDIDATE, handleIce)

        return () => {
            socket.off(SocketEvent.VOICE_OFFER, handleOffer)
            socket.off(SocketEvent.VOICE_ANSWER, handleAnswer)
            socket.off(SocketEvent.VOICE_ICE_CANDIDATE, handleIce)
        }
    }, [socket, createPeerConnection])

    // When a new remote user joins (users array updated), create peer and send offer if we joined voice
    useEffect(() => {
        if (!joined) return
        // create offers to all other users
        users.forEach(async (u: any) => {
            if (!u.socketId) return
            if (u.socketId === (socket.id as any)) return
            if (peersRef.current[u.socketId]) return
            try {
                const entry = await createPeerConnection(u.socketId)
                const offer = await entry.pc.createOffer()
                await entry.pc.setLocalDescription(offer)
                socket.emit(SocketEvent.VOICE_OFFER, { offer, targetSocketId: u.socketId })
            } catch (err) {
                console.error("Failed to create offer for", u.socketId, err)
                cleanupPeer(u.socketId)
            }
        })
    }, [joined, users, createPeerConnection, socket, cleanupPeer])

    // on user left/disconnect we should cleanup peer
    useEffect(() => {
        const handleUserLeft = ({ user }: any) => {
            if (!user?.socketId) return
            cleanupPeer(user.socketId)
        }
        socket.on(SocketEvent.USER_DISCONNECTED, handleUserLeft as any)
        return () => {
            socket.off(SocketEvent.USER_DISCONNECTED)
        }
    }, [socket, cleanupPeer])

    const joinVoice = async () => {
        if (joined) return
        try {
            // obtain microphone early
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
            setJoined(true)
            setLocalMuted(false)
        } catch (err) {
            console.error("Microphone access denied", err)
        }
    }

    const leaveVoice = () => {
        setJoined(false)
        // stop tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop())
            localStreamRef.current = null
        }
        // cleanup all peers
        Object.keys(peersRef.current).forEach((id) => cleanupPeer(id))
    }

    const toggleLocalMute = () => {
        if (!localStreamRef.current) return
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled))
        setLocalMuted((m) => !m)
    }

    const toggleRemoteMute = (socketId: string) => {
        const entry = peersRef.current[socketId]
        if (!entry) return
        const newVal = !remoteMutedMap[socketId]
        entry.muted = newVal
        entry.audioEl.muted = newVal
        setRemoteMutedMap((m) => ({ ...m, [socketId]: newVal }))
    }

    return (
        <div className="voice-chat my-2 flex flex-col gap-2">
            <div className="flex gap-2">
                <button className="btn" onClick={joined ? leaveVoice : joinVoice}>
                    {joined ? "Leave Voice" : "Join Voice"}
                </button>
                <button className="btn" onClick={toggleLocalMute} disabled={!joined}>
                    {localMuted ? "Unmute" : "Mute"}
                </button>
            </div>

            <div className="participants mt-2">
                <h4 className="text-sm font-medium">Participants</h4>
                <ul className="mt-1 flex flex-col gap-1">
                    {users.map((u: any) => (
                        <li key={u.socketId} className="flex items-center justify-between gap-2">
                            <div>
                                <strong>{u.username}</strong>
                                <div className="text-xs text-muted">{u.status}</div>
                            </div>
                            <div className="flex gap-2">
                                {u.socketId !== (socket.id as any) && (
                                    <button
                                        className="btn"
                                        onClick={() => toggleRemoteMute(u.socketId)}
                                    >
                                        {remoteMutedMap[u.socketId] ? "Unmute" : "Mute"}
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            {/* hidden container for audio elements to ensure they are attached to the DOM */}
            <div ref={audioContainerRef} style={{ display: "none" }} />
        </div>
    )
}

export default VoiceChat
