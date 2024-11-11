import { ReactElement } from "react";
import { StageBase, StageResponse, InitialData, Message } from "@chub-ai/stages-ts";
import { LoadResponse } from "@chub-ai/stages-ts/dist/types/load";

// Define types for state management

// MessageStateType for tracking user-specific interactions within messages
type MessageStateType = {
    currentScenario: number;
    obedienceLevel: number;
    tasksCompleted: number;
    scenarioProgress: boolean;
};

// ChatStateType to manage the state across the chat session
type ChatStateType = {
    currentScenario: number;
    scenarioProgress: boolean;
};

// InitStateType for any configuration settings that are only set once
type InitStateType = {
    userPreferences: {
        difficulty: string;
        preferredTheme: string;
    };
};

// ConfigType for any user-supplied configuration options
type ConfigType = any;

// Mock database to simulate persistent storage
const mockDatabase: { [key: string]: any } = {};

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    // Define an internal state to manage the data during the session
    myInternalState: MessageStateType;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);

        const { users, messageState, chatState } = data;

        // Assign a unique identifier to each user based on available information
        const userId = this.getUserId(users[0]);

        // Initialize message state with all required properties or load from the database
        this.myInternalState = messageState || this.loadMessageState(userId);

        // Initialize chat state with all required properties or load from the database
        this.myInternalState = {
            ...this.myInternalState,
            currentScenario: chatState?.currentScenario || 0,
            scenarioProgress: chatState?.scenarioProgress || false,
        };
    }

    /**
     * Method to get a unique identifier for a user.
     * If specific fields like name or username are unavailable,
     * it defaults to a placeholder value.
     */
    private getUserId(user: any): string {
        return user.name || user.username || "defaultUserId";
    }

    /**
     * Load user-specific message state from mock storage or initialize with default values.
     */
    loadMessageState(userId: string): MessageStateType {
        const storedState = mockDatabase[userId]?.messageState || {};
        return {
            currentScenario: storedState.currentScenario || 0,
            obedienceLevel: storedState.obedienceLevel || 0,
            tasksCompleted: storedState.tasksCompleted || 0,
            scenarioProgress: storedState.scenarioProgress || false
        };
    }

    /**
     * Load user-specific chat state from mock storage or initialize with default values.
     */
    loadChatState(userId: string): ChatStateType {
        const storedChatState = mockDatabase[userId]?.chatState || {};
        return {
            currentScenario: storedChatState.currentScenario || 0,
            scenarioProgress: storedChatState.scenarioProgress || false
        };
    }

    /**
     * Save the current state to the mock database.
     */
    saveState(userId: string) {
        mockDatabase[userId] = {
            messageState: this.myInternalState,
            chatState: {
                currentScenario: this.myInternalState.currentScenario,
                scenarioProgress: this.myInternalState.scenarioProgress
            }
        };
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        const userId = "defaultUserId"; // Hardcoded for demonstration; replace if you obtain a unique ID in production
        this.saveState(userId);  // Save on load to ensure initial state persistence

        return {
            success: true,
            error: null,
            initState: null,
            chatState: {
                currentScenario: this.myInternalState.currentScenario,
                scenarioProgress: this.myInternalState.scenarioProgress
            },
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        if (state != null) {
            this.myInternalState = { ...this.myInternalState, ...state };
            this.saveState("defaultUserId");  // Persist changes to storage
        }
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const { content, isBot } = userMessage;

        if (content.toLowerCase().includes("yes mistress") && !isBot) {
            this.myInternalState.obedienceLevel += 1;
        } else if (content.toLowerCase().includes("no") && !isBot) {
            this.myInternalState.obedienceLevel -= 1;
        }

        const success = this.checkTaskCompletion(content);
        if (success) {
            this.myInternalState.tasksCompleted += 1;
            this.myInternalState.scenarioProgress = true;
        }

        const systemMessage = this.getSystemMessage(content, success);

        // Save state to mock database for persistence
        this.saveState("defaultUserId");

        return {
            stageDirections: null,
            messageState: { ...this.myInternalState },
            modifiedMessage: content,
            systemMessage,
            error: null,
            chatState: {
                currentScenario: this.myInternalState.currentScenario,
                scenarioProgress: this.myInternalState.scenarioProgress
            }
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const { content } = botMessage;

        if (this.myInternalState.tasksCompleted >= 3) {
            this.advanceScenario();
        }

        const systemMessage = this.prepareFeedback(content);

        this.saveState("defaultUserId");  // Persist state updates

        return {
            stageDirections: null,
            messageState: { ...this.myInternalState },
            modifiedMessage: null,
            systemMessage,
            error: null,
            chatState: {
                currentScenario: this.myInternalState.currentScenario,
                scenarioProgress: this.myInternalState.scenarioProgress
            }
        };
    }

    private checkTaskCompletion(content: string): boolean {
        const completionKeywords = ["done", "completed", "finished", "yes mistress"];
        return completionKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }

    private getSystemMessage(content: string, success: boolean): string | null {
        if (success) {
            return "Well done. You've completed another task.";
        } else if (content.toLowerCase().includes("no")) {
            return "That's not the obedience we expect. You’re reminded to follow instructions closely.";
        }
        return null;
    }

    private advanceScenario() {
        this.myInternalState.currentScenario += 1;
        this.myInternalState.tasksCompleted = 0;
        this.myInternalState.scenarioProgress = false;
        this.myInternalState.obedienceLevel = Math.max(this.myInternalState.obedienceLevel - 1, 0);

        return `Scenario ${this.myInternalState.currentScenario} begins. Follow your new instructions closely.`;
    }

    private prepareFeedback(content: string): string | null {
        if (this.myInternalState.obedienceLevel >= 5) {
            return "You've demonstrated a high level of obedience. Proceed confidently.";
        } else if (this.myInternalState.obedienceLevel <= -3) {
            return "Your disobedience is noted. There may be consequences.";
        }
        return null;
    }

    render(): ReactElement {
        return (
            <div style={{ width: '100vw', height: '100vh', display: 'grid', alignItems: 'stretch' }}>
                <div>Current Scenario: {this.myInternalState.currentScenario}</div>
                <div>Obedience Level: {this.myInternalState.obedienceLevel}</div>
                <div>Tasks Completed: {this.myInternalState.tasksCompleted}</div>
                <div>Scenario Progress: {this.myInternalState.scenarioProgress ? "In Progress" : "Waiting"}</div>
            </div>
        );
    }
}
