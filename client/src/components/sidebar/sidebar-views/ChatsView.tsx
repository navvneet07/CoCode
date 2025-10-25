import ChatInput from "@/components/chats/ChatInput"
import ChatList from "@/components/chats/ChatList"
import VoiceChat from "@/components/chats/VoiceChat"
import useResponsive from "@/hooks/useResponsive"

const ChatsView = () => {
    const { viewHeight } = useResponsive()

    return (
        <div
            className="flex max-h-full min-h-[400px] w-full flex-col gap-2 p-4"
            style={{ height: viewHeight }}
        >
            <h1 className="view-title">Group Chat</h1>
            {/* Chat list */}
            <ChatList />
            {/* Chat input */}
            <VoiceChat />
            <ChatInput />
        </div>
    )
}

export default ChatsView
