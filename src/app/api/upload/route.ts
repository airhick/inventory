import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const serialNumber = formData.get('serial_number') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Create filename similar to server.py: {serial}_{random}.{ext}
        const ext = file.name.split('.').pop() || 'jpg';
        const safeSerial = (serialNumber || 'img').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        const uniqueId = crypto.randomBytes(6).toString('hex');
        const filename = `${safeSerial}_${uniqueId}.${ext}`;

        // Ensure directory exists
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });

        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, buffer);

        return NextResponse.json({
            success: true,
            url: `/uploads/${filename}`
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
