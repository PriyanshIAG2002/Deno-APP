import { Application, Router } from "oak";
import PptxGenJS from "pptxgenjs";
import OpenAI from "openai";

// Load environment variables from .env file
const envPath = new URL('.env', import.meta.url);
await Deno.readTextFile(envPath)
  .then(rawEnv => {
    for (const line of rawEnv.split('\n')) {
      const [key, value] = line.split('=');
      if (key && value) {
        Deno.env.set(key.trim(), value.trim());
      }
    }
  })
  .catch(err => {
    console.error("Error loading .env file:", err);
    throw new Error("Please create a .env file with OPENAI_API_KEY");
  });

// Verify OpenAI API key is present
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required in .env file");
}

// Create presentations storage directory if it doesn't exist
const presentationsDir = "./presentations";
try {
  await Deno.mkdir(presentationsDir);
} catch (error) {
  if (!(error instanceof Deno.errors.AlreadyExists)) {
    throw error;
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"), // Make sure to set this environment variable
});

const app = new Application();
const router = new Router();

// Add these color and layout constants at the top of the file
const THEME = {
  primary: "2C3E50",     // Dark blue-gray
  secondary: "F1C40F",   // Warm yellow
  text: "34495E",        // Slate gray
  background: "FFFFFF",  // White
  accent: "F39C12"      // Orange
};

const LAYOUT = {
  margin: 0.5,
  titleFontSize: 44,
  headingFontSize: 32,
  bodyFontSize: 18,
  defaultFont: "Arial",
};

// Helper function to get presentation content from OpenAI
async function generatePresentationContent(topic: string) {
  console.log('Generating content for topic:', topic);
  
  const prompt = `Create a detailed and informative presentation outline for "${topic}". 
The presentation should be comprehensive and include specific facts, statistics, and detailed points.

Structure the presentation with these sections:
1. Introduction & Background
2. Key Features/Aspects (with specific details)
3. Important Milestones/Statistics
4. Current Trends/State
5. Future Outlook
6. Conclusion

Format as JSON exactly like this:
{
  "title": "Main Presentation Title",
  "slides": [
    {
      "title": "slide title",
      "content": [
        "Detailed point with specific information",
        "Statistical data or concrete example",
        "Comprehensive explanation with context"
      ]
    }
  ]
}

Ensure each point is detailed (20-30 words) and includes specific information, not just general statements.
The response must be valid JSON without any additional text.`;

  console.log('Sending prompt to OpenAI:', prompt);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    console.log('Raw OpenAI response:', completion.choices[0].message.content);

    const parsedContent = JSON.parse(completion.choices[0].message.content);
    console.log('Parsed presentation content:', parsedContent);
    
    return parsedContent;
  } catch (error) {
    console.error('Error in generatePresentationContent:', error);
    throw error;
  }
}

// Hello API endpoint
router.get("/api/hello", (ctx) => {
  ctx.response.body = { message: "Hello from Deno!" };
});

// Enhanced Create PPT endpoint
router.post("/api/presentations", async (ctx) => {
  try {
    console.log('Received POST request to /api/presentations');
    
    const body = ctx.request.body();
    console.log('Request body type:', body.type);
    
    if (body.type !== "json") {
      throw new Error("Request body must be JSON");
    }
    
    const value = await body.value;
    console.log('Request body value:', value);
    
    const { topic } = value;
    if (!topic) {
      throw new Error("Topic is required");
    }
    
    console.log('Processing topic:', topic);

    // Get content from OpenAI
    const presentationContent = await generatePresentationContent(topic);
    console.log('Generated presentation content:', presentationContent);

    // Create presentation with minimal master slide
    const pres = new PptxGenJS();

    // Simplified master slide
    pres.defineSlideMaster({
      title: 'MASTER_SLIDE',
      background: { color: THEME.background },
      objects: [
        {
          text: {
            text: "Created with AI",
            options: {
              x: 0.5,
              y: 6.7,
              color: THEME.text,
              fontSize: 9,
              opacity: 0.5,
            },
          },
        },
      ],
    });

    // Add title slide with minimal design
    const titleSlide = pres.addSlide();
    
    // Add the yellow accent stripe
    titleSlide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 2.5,
      h: 0.3,
      fill: { color: THEME.secondary },
    });

    // Add title with clean styling
    titleSlide.addText(presentationContent.title, {
      x: 0.8,
      y: 2.5,
      w: "80%",
      fontSize: LAYOUT.titleFontSize,
      bold: true,
      color: THEME.primary,
      align: "left",
      fontFace: "Arial",
    });

    // Add content slides with minimal design
    for (const slide of presentationContent.slides) {
      const newSlide = pres.addSlide({ masterName: 'MASTER_SLIDE' });
      
      // Add the yellow accent stripe
      newSlide.addShape(pres.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 2.5,
        h: 0.3,
        fill: { color: THEME.secondary },
      });

      // Add slide title with clean styling
      newSlide.addText(slide.title, {
        x: 0.8,
        y: 0.8,
        w: "80%",
        fontSize: LAYOUT.headingFontSize,
        bold: true,
        color: THEME.primary,
        fontFace: "Arial",
      });

      // Add bullet points with improved spacing
      newSlide.addText(slide.content.map(text => ({
        text,
        options: {
          bullet: true,
          paraSpaceBefore: 8,
          paraSpaceAfter: 8,
        }
      })), {
        x: 0.8,
        y: 2.3,
        w: "85%",
        fontSize: LAYOUT.bodyFontSize,
        color: THEME.text,
        bullet: { code: "2013" },
        fontFace: "Arial",
        lineSpacing: 20,
        valign: "top",
      });
    }

    // Generate unique filename
    const filename = `presentation_${Date.now()}.pptx`;
    const filepath = `${presentationsDir}/${filename}`;
    console.log('Saving presentation to:', filepath);

    // Save the presentation
    await pres.writeFile({ fileName: filepath });
    console.log('Presentation saved successfully');

    ctx.response.body = {
      message: "Presentation created successfully",
      filename: filename,
      content: presentationContent,
    };
  } catch (error) {
    console.error('Error in presentation creation:', error);
    console.error('Error stack:', error.stack);
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// Get presentations list endpoint
router.get("/api/presentations", async (ctx) => {
  try {
    const presentations = [];
    for await (const dirEntry of Deno.readDir(presentationsDir)) {
      if (dirEntry.isFile && dirEntry.name.endsWith('.pptx')) {
        presentations.push(dirEntry.name);
      }
    }
    ctx.response.body = { presentations };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// Setup middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
const port = 8000;
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });
