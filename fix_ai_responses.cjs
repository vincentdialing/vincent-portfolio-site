const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  `about: ["about", "who", "vincent", "background", "experience"]`,
  `about: ["about", "who", "vincent", "background", "experience"],\n  coreSkills: ["what are your core skills", "core skills", "core"],\n  uiuxWorkflow: ["ui/ux workflow", "describe your ui/ux workflow", "workflow"],\n  smmApproach: ["social media management", "approach social media"]`
);

code = code.replace(
  `about: "I'm a multi-disciplinary creative based in Davao City who blends design, development, and marketing to build premium digital experiences."`,
  `about: "I'm a multi-disciplinary creative based in Davao City who blends design, development, and marketing to build premium digital experiences.",\n  coreSkills: "My core skills revolve around UI/UX Design, Frontend Development, Graphic Design, and Social Media Management. I blend design with code to create complete digital experiences.",\n  uiuxWorkflow: "My UI/UX workflow starts with user research and wireframing to establish a solid foundation. Then, I move to Figma for high-fidelity prototyping and interactive testing before handing off clean, developer-ready assets.",\n  smmApproach: "For Social Media Management, I focus on end-to-end strategy. I handle everything from designing engaging visual content and planning content calendars, to data-driven community engagement that drives organic growth."`
);

fs.writeFileSync('src/main.js', code);
console.log('AI Responses updated!');
