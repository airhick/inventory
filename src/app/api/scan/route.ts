import { NextRequest, NextResponse } from 'next/server';
import { createWorker } from 'tesseract.js';
import { join } from 'path';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // We need to write the file to disk or pass buffer to tesseract
        // Tesseract.js accepts buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        const worker = await createWorker('eng'); // Default to english, maybe add 'fra'?
        const ret = await worker.recognize(buffer);
        await worker.terminate();

        return NextResponse.json({
            text: ret.data.text,
            confidence: ret.data.confidence
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
