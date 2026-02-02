# SecPipe Development Prompts

A curated collection of prompts used to build the SecPipe AI-powered security code review application.

---

## Phase 1: Initial Setup & KV Migration

### Pushing Updates and Migration
> We made some modifications and fixed things with this project, including switching to KV instead of SQL which helped for functionality. The code isn't pushed to my GitHub yet. Before pushing, there are probably other references to SQL that need to be changed to KV - let's get that done.

### Contributor Management
> Remove Claude as a contributor from the repo. Chris Demian should be the only one committing.

---

## Phase 2: Testing & Quality Verification

### Testing the Findings Workflow
> Approve the findings and get the remediation code.

> The remediation count is showing 0. Check the logs - is it still generating or did something go wrong?

### Understanding Output Variations
> It seems like it worked, but why did it give 7 issues this time instead of 2? Was that something we changed or just by chance?

---

## Phase 3: Documentation & README

### README Requirements
> Update the README to make it good and make sure it's up to date. For the MCP configuration, don't say "click configure MCP and add this URL" - just say something like "paste this URL into the MCP Servers section."

> Delete the technical highlights at the bottom.

---

## Phase 4: MCP Integration & Testing

### MCP Configuration
> Add this MCP: https://secpipe.chrismdemian.workers.dev/mcp

### Functional Testing
> My friend sent a request from Cursor to the MCP - check if you can see anything.

> Can you see the security MCP on Claude Code? Are you able to send it requests yourself?

---

## Phase 5: Comprehensive API Testing

### Test Planning
> I want you to plan for testing my API for functionality. Test many different things because you have access to the MCP and understand what it's supposed to do. Everything should work correctly. Find any issues and let me know so we can begin fixing them.

### Fix Implementation
> Fix the issues.

> Did you push the changes?

### Quality Verification
> Test the changes to make sure it didn't break anything. Is the functionality sound? Does it properly work and give tasks to different agents, and does the entire workflow work correctly?

> Is the quality of the outputs good? Does it give legitimate issues and fix them properly using the proper agents, not giving nonsense non-reachable ones?

> Did you commit the changes?

> Test and make sure the entire thing works well with no issues.

---

## Phase 6: UI Redesign Research

### Initial Research Request
> I want to make the UI of https://secpipe.chrismdemian.workers.dev/ better - make it not look vibecoded but a beautiful clean UI with an animated glow outline effect around the MCP Server URL box. Do research to find the best open source frontend UI repos with great designs, MCPs that work well for frontend design with good taste, and Claude skills with similar capabilities. Whatever else you can think of to make a great frontend and frontend workflow.

### Technology Stack Confirmation
> I want what will produce the best results - what's most used in the professional dev community, is simplest to implement for AI, and will look the best.

> Just making sure we're still using React, CSS, Aceternity - what most devs use, right?

### Cloudflare Integration
> If this is a Cloudflare issue, look through the docs and find a solution. I want to be able to build using that setup and have it active at https://secpipe.chrismdemian.workers.dev/. Is that possible without getting too complicated?

---

## Phase 7: UI Implementation & Iteration

### Workflow Improvement Request
> The UI still looks bad. Is there anything like an MCP that takes screenshots of the website so you can iterate visually? Every time you make changes it looks bad. Do some research on other people's frontend workflows with Claude Code.

> Do more research on people's frontend workflows with Claude Code and use the best one or a good combination. I want a professionally designed UI. Look into the frontend skill too.

### Spacing and Layout Adjustments
> Good start. Some issues: the "AI powered security analysis with reachability filtering" text is off-center and on two lines. Everything is too condensed - the noise reduced stats are very close to everything else. The glow border box should be more rectangular with larger height, with the link centered and copy button in the top right.

> Much better now. A few things: add more space between "AI-powered security analysis" and the stats. Add more space between the stats and the MCP server box. The MCP server box should be taller and the link should be centered (it's at the bottom now). The copy button shouldn't have a different colored background - it should just be an icon that turns into a checkmark when clicked. The copy button is overlapping with the border. Add space between the MCP server box and the features below. The "Works with" badges have borders that are too tight.

> The MCP server box is too big now. The link is centered which is good. Remove the "MCP Server" button label. Make the box a bit smaller. Keep the copy button within the borders when you resize.

### Fine-Tuning Spacing
> Great that you figured out how to change spacing. But now it's way too much space. I wanted a little bit of extra space, not that much. The MCP box is too small now - I want it in between with good padding and the link in the middle. The copy button is clipped outside the box - put it back in the top right like before. There's too much space between the box and the features below.

> The box size looks good. The link is at the bottom instead of centered in the middle. The copy button is slightly too big and clipped in the corner - move it inward. Decrease spacing a little bit between "AI powered security analysis" and the stats, and between the stats and the MCP box.

> Basically 90% there, just a few tiny tweaks. Add a little bit of space between "Human-in-the-loop approval" and "Works with". Add a little bit of space between "SecPipe" and "AI-powered security analysis" - move the SecPipe word and logo a little higher.

> You added way too much space between "Works with" and "Human-in-the-loop approval" - I said a little bit, that's a lot. I don't see any space added between the SecPipe logo and the description.

---

## Phase 8: Knowledge Capture

### Saving Learnings
> Now that we finished this UI, I noticed that what we did and what you learned really improved - the first couple UIs you built were really bad, but then you learned a lot along the way. Incorporate your learnings into the CLAUDE.md so that next time I build frontend UIs it'll know what to do and how to do things - not specifically for this project but in general.

> You didn't mention anything about getting real components from libraries.

---

## Phase 9: Documentation & Git Cleanup

### Prompt Export
> For my project I need all the prompts I used to build the entire thing. How would I find these files? Also, did you push the changes to GitHub?

### Git History Cleanup
> Remove Claude as a contributor. Do it for all commits - there are 3 more.

> Just making sure this didn't change any of the pushed code, correct?

### Project Structure
> Is the file structure supposed to look like that? It seems messy with so many files on the main page. Is the project structure in the README updated to reflect what we've changed?

---

## Final Request

### Prompt Compilation
> Look through all the files with our conversations and compile my prompts from the very beginning of this project. Make sure the prompts sound intelligent - like I understand the problem and am just directing you to fix it. Remove prompts that don't add value.
