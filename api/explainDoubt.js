// THIS IS THE MAGIC LINE: It switches Vercel to the Edge Runtime, bypassing the 10s timeout.
export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // CORS Headers for Edge
  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  };

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Reject anything that isn't a POST request
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    // In Edge, you must manually parse the JSON body
    const questionObj = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY environment variable in Vercel" }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const promptText = `
      You are an expert tutor for a competitive exam. Break down this multiple-choice question for a student.
      Question: ${questionObj.question || 'Image/Match based question'}
      Options: ${JSON.stringify(questionObj.options || [])}
      Correct Answer Index (0-based): ${questionObj.correct}
      Official Explanation (if any): ${questionObj.explanation || 'None provided'}

      Provide a JSON response with exactly these three keys:
      "coreConcept": A short paragraph explaining the foundational concept being tested. Use HTML tags like <strong> for bolding instead of markdown.
      "whyCorrect": Explain exactly why the correct option is right. Use HTML tags like <strong> for bolding instead of markdown.
      "whyIncorrect": Explain why the other distractor options are wrong. Use HTML tags like <strong> for bolding instead of markdown.

      CRITICAL FORMATTING RULES:
      1. Ensure proper spaces between all words. Never jam words together (e.g. write "cost price (CP)" instead of "cost price(CP)").
      2. Every single mathematical expression, variable, fraction, or symbol (such as CP, SP, percentages, or equations) MUST be fully wrapped in single dollar signs (e.g. $CP$, $SP$, $\\frac{10}{9}$, $\\times 100$). Never output raw LaTeX backslashes without enclosing them in $.
    `;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!geminiRes.ok) {
      const errorDetails = await geminiRes.text();
      throw new Error(`Google API responded with status ${geminiRes.status}: ${errorDetails}`);
    }

    const data = await geminiRes.json();
    const aiText = data.candidates[0].content.parts[0].text;
    const aiJson = JSON.parse(aiText);

    // Return the successful AI response
    return new Response(JSON.stringify(aiJson), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("AI Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}
