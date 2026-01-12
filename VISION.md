# Kimu: From Video Editor to Content Factory

## The Vision

To pivot Kimu from a manual video editor into a **Video Template Engine** and **Content Factory**. This system allows a "Content Architect" to define visual rules once and generate high-value educational and networking content (YouTube, LinkedIn) at scale through automation.

---

## 1. Core Architectural Shift

### From "Static Timelines" to "Scene Libraries"

Instead of building one fixed 60-second video, Kimu will focus on a **Modular Scene Architecture**:

- **Atomic Scenes:** Small, reusable Remotion compositions (3-10 seconds) designed for specific purposes (e.g., Hook, Deep Dive, Quote, Call to Action).
- **Elasticity:** Scenes are not fixed in duration. They expand or contract based on the length of the input (e.g., audio duration or text length). This is only handled during server side rendering or video exporting using the new media items
- **Theming:** Visual styles (colors, fonts, aspect ratios) are passed as high-level props, allowing the same logic to render differently for LinkedIn (4:5) vs. YouTube (16:9).

---

## 2. Technical Pillars

### A. The Variable System

The `TimelineSchema` must support **Variable Bindings** instead of hardcoded values.

- **Syntax:** `{{headline}}`, `{{background_video}}`.
- **Resolution:** The renderer resolves these bindings at runtime using an `inputProps` object.

### B. Audio-Driven Pacing

High-value educational content requires perfect synchronization.

- **Workflow:** Use forced-alignment (like Whisper) to get timestamps for the script.
- **Implementation:** The engine maps these timestamps to the "Elastic Scenes," ensuring the visual transition happens exactly when the speaker says the keyword.

### C. Multi-Platform Theming

Decouple logic from style.

- Pass a `theme` object to the renderer to inject brand colors, typography, and layout constraints without changing the underlying timeline structure.

---

## 3. The Automation Workflow

1. **The Scripting Phase:** User provides a script and voiceover/assets.
2. **The Director Agent:** A script-to-schema layer (AI or rule-based) that:
   - Analyzes keywords.
   - Selects the best **Scene** from the library for each script segment.
   - Generates a populated **Kimu JSON Schema**.
3. **The Rendering Phase:** The Kimu Engine (Remotion) consumes the JSON and outputs the final MP4.

---

## 4. Value Proposition

- **Scalability:** Produce a week's worth of content in the time it takes to write the scripts.
- **Consistency:** Maintain a "Signature Look" across all videos automatically.
- **Adaptability:** Rapidly pivot content formats (e.g., turning a long-form YouTube video into 5 LinkedIn clips) by swapping the theme and layout library.
