require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const PORT = 3005;

app.use(
  cors({
    origin: "*",
  })
);
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

    // // Wait for completion
    // let runStatus;
    // do {
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   runStatus = await openai.beta.threads.runs.retrieve(thread_id, run.id);
    // } while (runStatus.status !== "completed");

     // Poll for completion with a timeout
     const completed = await waitForCompletion(thread_id, run.id);

     if (!completed) {
       return res.status(408).json({ error: "Assistant response timed out." });
     }
   

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

//Exponential backoff function that waiting for assistant to complete it run searching data
async function waitForCompletion(thread_id, run_id) {
  const maxRetries = 10;
  const maxWaitTime = 60000; // 60 seconds
  let retryCount = 0;
  let startTime = Date.now();

  while (retryCount < maxRetries) {
    try {
      const waitTime = Math.min(2 ** retryCount * 1000, 15000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      const runStatus = await openai.beta.threads.runs.retrieve(thread_id, run_id);

      if (runStatus.status === "completed") {
        return true; // Successfully completed
      }

      retryCount++;

      if (Date.now() - startTime > maxWaitTime) {
        console.error("Timeout: Assistant response took too long.");
        return false;
      }
    } catch (error) {
      console.error("Error checking run status:", error);
    }
  }

  console.error("Assistant did not complete in time.");
  return false;
}


app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
