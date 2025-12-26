import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const { prompt } = await request.json()

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Invalid prompt' },
                { status: 400 }
            )
        }

        const apiKey = process.env.HUGGINGFACE_API_KEY
        if (!apiKey) {
            console.error('HUGGINGFACE_API_KEY not found in environment variables')
            return NextResponse.json(
                { error: 'AI service not configured. Please add HUGGINGFACE_API_KEY to .env.local' },
                { status: 500 }
            )
        }

        const fullPrompt = `Generate exam questions about: "${prompt}"

Return ONLY a valid, raw JSON array (no markdown code blocks, no comments, no explanations) with this structure:
[
  {
    "question": "Question text here?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctIndex": 0,
    "points": 1
  }
]

Ensure:
1. Valid JSON syntax (quotes are escaped properly).
2. "options" must be an array of strings.
3. "correctIndex" is a number 0-3.
4. Generate 5-8 questions.`

        // Using Mistral model via Hugging Face Router (OpenAI Compatible)
        const response = await fetch(
            'https://router.huggingface.co/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'Qwen/Qwen2.5-7B-Instruct',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    max_tokens: 1500,
                    temperature: 0.7
                })
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Hugging Face API Error:', errorText)

            // Check if model is loading
            if (errorText.includes('loading') || errorText.includes('currently loading')) {
                return NextResponse.json(
                    { error: 'AI model is loading. Please wait 30 seconds and try again.' },
                    { status: 503 }
                )
            }

            return NextResponse.json(
                { error: `AI generation failed: ${errorText}` },
                { status: response.status }
            )
        }

        const data = await response.json()

        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            console.error('Invalid response format:', data)
            return NextResponse.json(
                { error: 'Invalid AI response' },
                { status: 500 }
            )
        }

        let content = data.choices[0].message?.content || ''

        // Clean response
        content = content.trim()
        content = content.replace(/```json\n?/g, '')
        content = content.replace(/```\n?/g, '')

        // Find JSON array more robustly
        const firstBracket = content.indexOf('[')
        const lastBracket = content.lastIndexOf(']')

        if (firstBracket === -1 || lastBracket === -1 || firstBracket >= lastBracket) {
            console.error('No JSON array found. Response:', content)
            return NextResponse.json(
                { error: 'Failed to parse AI response. Please try again.' },
                { status: 500 }
            )
        }

        content = content.substring(firstBracket, lastBracket + 1)

        let questions
        try {
            questions = JSON.parse(content)
        } catch (parseError) {
            console.error('JSON parse error:', parseError)
            return NextResponse.json(
                { error: 'Failed to parse questions. Please try again.' },
                { status: 500 }
            )
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            return NextResponse.json(
                { error: 'No questions generated. Please try again.' },
                { status: 500 }
            )
        }

        // Validate questions
        const validQuestions = questions
            .filter(q =>
                q.question &&
                Array.isArray(q.options) &&
                q.options.length >= 2 &&
                typeof q.correctIndex === 'number' &&
                q.correctIndex >= 0 &&
                q.correctIndex < q.options.length
            )
            .map(q => ({
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                points: q.points || 1
            }))

        if (validQuestions.length === 0) {
            return NextResponse.json(
                { error: 'Generated questions are invalid. Please try again.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ questions: validQuestions })
    } catch (error: any) {
        console.error('AI Generation Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to generate questions' },
            { status: 500 }
        )
    }
}
