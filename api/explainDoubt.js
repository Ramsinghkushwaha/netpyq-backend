export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const questionObj = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable in Vercel" });
    }

    const promptText = `
      You are an expert tutor for a competitive exam. Break down this multiple-choice question for a student.
      Question: ${questionObj.question || 'Image/Match based question'}
      Options: ${JSON.stringify(questionObj.options || [])}
      Correct Answer Index (0-based): ${questionObj.correct}
      Official Explanation (if any): ${questionObj.explanation || 'None provided'}

      Provide a JSON response with exactly these three keys:
      "coreConcept": A short paragraph explaining the foundational concept being tested.
      "whyCorrect": Explain exactly why the correct option is right.
      "whyIncorrect": Explain why the other distractor options are wrong.
    `;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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

    return res.status(200).json(aiJson);

  } catch (error) {
    console.error("AI Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
