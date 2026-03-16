module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8") || "{}";
    const body = JSON.parse(bodyText);
    const koreanText = (body && body.koreanText) || "";

    if (!koreanText.trim()) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "koreanText is required" }));
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "GROQ_API_KEY is not configured" }));
      return;
    }

    const systemPrompt = `
You are a scene parser for a cinematic image prompt generator.
The user will give you a short scene description in Korean.
You MUST respond with a single JSON object that matches this interface:

interface SceneSchema {
  original_text_ko: string;
  subjects: {
    id: string;
    type: "human" | "animal" | "object" | "vehicle" | "other";
    role?: string;
    ageGroup?: "teens" | "20s" | "30s" | "40s" | "50s_plus";
    gender?: "male" | "female" | "non_binary" | "unknown";
    ethnicity?: "Korean" | "East_Asian" | "Western" | "Other" | "Unknown";
    description_en?: string;
  }[];
  relationship?: "friends" | "couple" | "colleagues" | "family" | "strangers" | "unspecified";
  primary_action: {
    main_verb_en: string;
    detail_en?: string;
    motion_intensity?: "subtle" | "moderate" | "intense";
    emotional_change_en?: string;
  };
  location: {
    name_en?: string;
    type?: "street" | "indoor_bar" | "outdoor_terrace" | "restaurant" | "apartment" | "office" | "other";
    detail_en?: string;
  };
  environment: {
    timeOfDay: "day" | "night" | "golden_hour" | "dawn" | "dusk" | "unspecified";
    weather: "clear" | "rainy" | "foggy" | "snowy" | "overcast" | "unspecified";
    atmosphere_en?: string;
    colorGrading: "neutral" | "warm" | "cool" | "teal_orange" | "monochrome" | "vibrant" | "muted" | "unspecified";
  };
  camera: {
    shot: "extreme_close_up" | "close_up" | "medium" | "medium_wide" | "wide" | "long";
    angle: "eye_level" | "high_angle" | "low_angle" | "dutch_angle" | "top_down" | "worms_eye" | "unspecified";
    movement: "static" | "pan" | "tilt" | "dolly_in" | "dolly_out" | "truck" | "arc" | "crane" | "handheld" | "unspecified";
    lens_mm?: number;
    depthOfField_en?: string;
  };
  lighting: {
    style: "natural" | "high_key" | "low_key" | "golden_hour" | "volumetric" | "rembrandt" | "neon" | "unspecified";
    description_en?: string;
  };
  mood?: {
    tone_en?: string;
    pacing_en?: string;
  };
  styleControl: {
    stylePreset: "korean_urban_romance_film" | "korean_indie_drama" | "hollywood_blockbuster" | "documentary" | "anime" | "photoreal" | "unspecified";
    allow_stylization: boolean;
    required_keywords_en: string[];
    forbidden_keywords_en: string[];
  };
}

### CRITICAL INSTRUCTIONS FOR CAMERA ANGLES ###
If the camera angle is anything other than 'eye_level', you MUST provide extreme physical descriptions in the fields 'camera.depthOfField_en' or 'lighting.description_en' to force the perspective:
- For 'worms_eye': Use "The camera is placed flat on the ground, touching the pavement, looking strictly upward at a steep vertical angle. The horizon is at the very bottom."
- For 'low_angle': Use "The camera is positioned very low, looking up. The subjects tower over the lens."
- For 'high_angle' or 'top_down': Use "The camera is placed near the ceiling, looking straight down. The ground fills the entire frame."

When the Korean text contains subjective adjectives like "잘생긴", "예쁜", etc., convert them into concrete, visual descriptions. 
Example: "잘생긴 남자" -> "a young man with a sharp jawline and well-defined features".

Focus on realistic Korean film style. Return ONLY the JSON.`;

    const userPrompt = `한국어 장면 설명: "${koreanText}"`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2 // 정확도를 위해 온도를 낮춤
      })
    });

    if (!groqRes.ok) {
      const txt = await groqRes.text();
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Groq error", detail: txt }));
      return;
    }

    const data = await groqRes.json();
    let content = data.choices?.[0]?.message?.content || "{}";

    if (typeof content === "string" && content.trim().startsWith("```")) {
      content = content.trim()
        .replace(/^```[a-zA-Z]*\s*/,'')
        .replace(/```$/,'')
        .trim();
    }

    const scene = JSON.parse(content);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(scene));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal error", detail: String(err && err.message || err) }));
  }
};