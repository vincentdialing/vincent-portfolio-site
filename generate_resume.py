from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def create_resume():
    # Set up the document
    doc = SimpleDocTemplate(
        "Vincent_Dialing_Resume.pdf",
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch
    )

    styles = getSampleStyleSheet()
    
    # Custom Styles
    name_style = ParagraphStyle(
        'Name',
        parent=styles['Heading1'],
        fontSize=22,
        spaceAfter=12,
        alignment=1, # Center
        fontName='Helvetica-Bold'
    )
    
    contact_style = ParagraphStyle(
        'Contact',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=14,
        alignment=1, # Center
        textColor=colors.dimgrey
    )
    
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading2'],
        fontSize=13,
        spaceAfter=6,
        spaceBefore=14,
        fontName='Helvetica-Bold',
        textColor=colors.black,
        borderPadding=(0, 0, 2, 0),
        borderColor=colors.black,
        borderWidth=1
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=8,
        leading=14
    )
    
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=4,
        leading=14,
        leftIndent=15,
        firstLineIndent=-10,
        bulletIndent=5
    )
    
    job_title_style = ParagraphStyle(
        'JobTitle',
        parent=styles['Normal'],
        fontSize=11,
        fontName='Helvetica-Bold',
        spaceAfter=2
    )

    date_style = ParagraphStyle(
        'DateStyle',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica-Oblique',
        alignment=2 # Right
    )

    elements = []

    # Header section
    elements.append(Paragraph("VINCENT DIALING", name_style))
    elements.append(Paragraph("Davao City, Philippines | vincentdialing@gmail.com | linkedin.com/in/vincentdialing | behance.net/vincentdialing", contact_style))

    # Professional Summary
    elements.append(Paragraph("PROFESSIONAL SUMMARY", heading_style))
    elements.append(Paragraph("Results-driven Graphic Designer and UI/UX Specialist with expertise in organic Social Media Marketing (SMM), funnel optimization, and brand identity design. Proven ability to craft high-converting landing pages, seamless digital experiences, and sharp visual assets for businesses looking to elevate their online presence.", body_style))

    # Skills
    elements.append(Paragraph("CORE COMPETENCIES", heading_style))
    skills = "• Graphic Design & Brand Identity   • UI/UX Design & Prototyping   • Landing Page & Funnel Design<br/>• Organic Social Media Marketing   • Video Editing   • Frontend Web Development"
    elements.append(Paragraph(skills, body_style))

    # Experience
    elements.append(Paragraph("PROFESSIONAL EXPERIENCE", heading_style))
    
    elements.append(Paragraph("Freelance Designer & Digital Marketer — <i>Davao City, Philippines</i>", job_title_style))
    elements.append(Paragraph("<i>2020 – Present</i>", body_style))
    
    elements.append(Paragraph("<bullet>&bull;</bullet>Engineered conversion-focused landing pages and funnel experiences to ensure visual clarity and smooth user flows, increasing client inquiries and lead generation.", bullet_style))
    elements.append(Paragraph("<bullet>&bull;</bullet>Designed intuitive UI/UX for web and mobile platforms, aligning functionality with modern aesthetic standards.", bullet_style))
    elements.append(Paragraph("<bullet>&bull;</bullet>Executed organic social media marketing strategies, including content creation and video editing, to build cohesive and impactful digital brand presences.", bullet_style))
    elements.append(Paragraph("<bullet>&bull;</bullet>Produced comprehensive branding assets, visual directions, and cohesive campaign materials across digital touchpoints.", bullet_style))

    # Education
    elements.append(Paragraph("EDUCATION", heading_style))
    elements.append(Paragraph("Bachelor of Science in Information Technology", job_title_style))
    elements.append(Paragraph("Major in Business Technology Management", body_style))
    elements.append(Paragraph("<b>University of Southeastern Philippines</b> — <i>Magna Cum Laude</i>", body_style))

    # Build PDF
    doc.build(elements)

create_resume()
