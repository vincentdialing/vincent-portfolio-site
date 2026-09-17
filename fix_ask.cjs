const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Change button text
html = html.replace(
  "Speak with Vincent",
  "Ask about Vincent"
);

// Add suggested questions UI above input area
const qButtons = `
      <!-- Suggested Questions -->
      <div id="suggested-questions" style="display: flex; flex-direction: column; gap: 8px; margin: 0 20px 10px 20px;">
        <button class="suggested-q-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px 15px; border-radius: 20px; text-align: left; font-size: 0.9rem; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'" onclick="document.getElementById('chat-input').value = this.innerText; document.getElementById('send-btn').click(); this.parentElement.style.display = 'none';">What are your core skills?</button>
        <button class="suggested-q-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px 15px; border-radius: 20px; text-align: left; font-size: 0.9rem; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'" onclick="document.getElementById('chat-input').value = this.innerText; document.getElementById('send-btn').click(); this.parentElement.style.display = 'none';">Can you describe your UI/UX workflow?</button>
        <button class="suggested-q-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px 15px; border-radius: 20px; text-align: left; font-size: 0.9rem; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'" onclick="document.getElementById('chat-input').value = this.innerText; document.getElementById('send-btn').click(); this.parentElement.style.display = 'none';">How do you approach Social Media Management?</button>
      </div>
      
      <!-- Input Area (Positioned above Wave) -->
`;

html = html.replace(
  "<!-- Input Area (Positioned above Wave) -->",
  qButtons
);

fs.writeFileSync('index.html', html);
console.log('Ask about Vincent applied!');
