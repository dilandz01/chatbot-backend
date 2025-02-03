require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const PORT = 3005;

app.use(cors({
  origin: '*'
}));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Route to handle user messages
app.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;

  try {
    let thread_id = threadId;

    // If no thread ID exists, create a new conversation
    if (!thread_id) {
      const thread = await openai.beta.threads.create();
      thread_id = thread.id;
    }

    // Send user message to the Assistant
    await openai.beta.threads.messages.create(thread_id, {
      role: "user",
      content: message,
    });

    // Run the Assistant
    const run = await openai.beta.threads.runs.create(thread_id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // Wait for completion
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 500));
      runStatus = await openai.beta.threads.runs.retrieve(thread_id, run.id);
    } while (runStatus.status !== "completed");

    // Get the Assistant's response
    const messages = await openai.beta.threads.messages.list(thread_id);
    const assistantResponse = messages.data
      .filter((msg) => msg.role === "assistant")
      .map((msg) => msg.content[0].text.value)
      .join("\n");

    res.json({ threadId: thread_id, response: assistantResponse });
  } catch (error) {
    console.error("Error communicating with OpenAI:", error.message);
    res.status(500).json({ error: "Failed to get response from Assistant" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
