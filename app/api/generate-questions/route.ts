import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        // SECURITY: Verify session
        const session = await getSession()
        if (!session || !session.id) {
            return NextResponse.json(
                { error: 'Unauthorized: Please login first' },
                { status: 401 }
            )
        }

        const { prompt, count = 5, difficulty = 'medium', type = 'mixed', existingQuestions = [] } = await request.json()

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Invalid prompt' },
                { status: 400 }
            )
        }

        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GROQ_API_KEY not found in environment variables' },
                { status: 500 }
            )
        }

        const groq = new Groq({
            apiKey: apiKey
        });

        // Construct System Prompt
        const systemPrompt = `You are an expert exam question generator. Your task is to generate unique, high-quality exam questions in valid JSON format.

RULES:
1. Return ONLY a pure JSON array of objects. No markdown, no comments, no explanations.
2. The JSON structure for each question must be:
   {
     "question": "Question text",
     "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
     "correctIndex": 0, // 0-3
     "points": 1
   }
3. Generate EXACTLY the requested number of questions.
4. ALL questions must be UNIQUE. Do not repeat concepts or questions.
5. "options" must be an array of usually 4 strings.
6. "correctIndex" must be a valid index (0 to length-1).`

        // Handle existing questions to avoid duplicates
        let avoidContext = '';
        if (Array.isArray(existingQuestions) && existingQuestions.length > 0) {
            // Limit to last 30 questions to save context window and avoid token limits
            const recentQuestions = existingQuestions.slice(-30);
            avoidContext = `\n\nCRITICAL: DO NOT GENERATE questions that are similar or identical to the following:\n${recentQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
        }

        // Construct User Prompt
        const userPrompt = `Topic: "${prompt}"
Number of Questions: ${count}
Difficulty: ${difficulty}
Question Type: ${type === 'conceptual' ? 'Theoretical' : type === 'practical' ? 'Practical/Scenario-based' : 'Mixed'}
${avoidContext}

Generate ${count} questions now.`

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3, // Lower temperature for more deterministic and consistent output
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices[0]?.message?.content || ''

        if (!content) {
            throw new Error('No content received from AI')
        }

        // Parse JSON
        let parsedData;
        try {
            // Attempt to find JSON array or object
            const jsonStr = content.replace(/```json\n?|```/g, '').trim();
            parsedData = JSON.parse(jsonStr);
        } catch (e) {
            console.error('JSON Parse Error:', e, content);
            throw new Error('Failed to parse AI response');
        }

        // Handle if response is wrapped in an object or just an array
        let questions = Array.isArray(parsedData) ? parsedData : (parsedData.questions || parsedData.data || []);

        if (!Array.isArray(questions) || questions.length === 0) {
            // Fallback: simpler parsing if structure didn't match
            if (typeof parsedData === 'object') {
                // Try to find any array value
                const values = Object.values(parsedData);
                const arrayVal = values.find(v => Array.isArray(v));
                if (arrayVal) questions = arrayVal as any[];
            }
        }

        if (!questions || questions.length === 0) {
            throw new Error('No questions found in AI response');
        }

        // Deduplication & Validation
        const uniqueQuestionsMap = new Map();

        // Prepare strict global exclusion set
        const globalExistingSet = new Set(
            (Array.isArray(existingQuestions) ? existingQuestions : [])
                .map((q: any) => typeof q === 'string' ? q.trim().toLowerCase() : '')
        );

        questions.forEach((q: any) => {
            if (
                q.question &&
                Array.isArray(q.options) &&
                q.options.length >= 2 &&
                typeof q.correctIndex === 'number'
            ) {
                const normalizedText = q.question.trim().toLowerCase();

                // 1. Check if it duplicates a question in the current batch
                // 2. Check if it duplicates a question from existing list (Global Deduplication)
                if (!uniqueQuestionsMap.has(normalizedText) && !globalExistingSet.has(normalizedText)) {
                    uniqueQuestionsMap.set(normalizedText, {
                        question: q.question,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        points: q.points || 1
                    });
                }
            }
        });

        let validQuestions = Array.from(uniqueQuestionsMap.values());

        // Ensure we don't exceed requested count (though rare with strict prompt)
        if (validQuestions.length > count) {
            validQuestions = validQuestions.slice(0, count);
        }

        return NextResponse.json({ questions: validQuestions })

    } catch (error: any) {
        // console.error('Groq Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to generate questions' },
            { status: 500 }
        )
    }
}
