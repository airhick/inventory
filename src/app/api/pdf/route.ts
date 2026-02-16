import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { title, content } = body;

        const doc = new PDFDocument();

        // Buffer to store PDF
        let buffers: any[] = [];
        doc.on('data', buffers.push.bind(buffers));

        return new Promise((resolve) => {
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                const response = new NextResponse(pdfData, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="document.pdf"`,
                    },
                });
                resolve(response);
            });

            // Generate PDF content
            doc.fontSize(25).text(title || 'Document', 100, 100);
            doc.fontSize(12).text(content || '', 100, 150);

            // Add more complex formatting here matching server.py logic (caution location etc)
            // For now, this is a placeholder for the structure.

            doc.end();
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
