export type Chunk = {
  id: string;
  page_title: string;
  page_url: string;
  section: string;
  text: string;
  image_url: string;
  categories: string[];
  embedding: number[];
};

export type ProgressionStage =
  | "pre-bosses"
  | "pre-hardmode"
  | "hardmode-pre-mech"
  | "hardmode-post-mech"
  | "post-plantera"
  | "post-golem"
  | "post-moonlord";

export type WorldType = "corruption" | "crimson";

export type Progression = {
  stage: ProgressionStage;
  bosses_defeated: string[];
  current_armor: string;
  key_accessories: string[];
  world_type: WorldType;
  notes: string;
};

export type QueryRequest = {
  query: string;
  // Optional inline override of server-side progression. When present, it is
  // used for retrieval+LLM in place of data/progression.json (does not persist).
  progression?: {
    stage?: ProgressionStage;
    bosses_defeated?: string[];
    current_armor?: string | null;
    key_accessories?: string[];
    world_type?: WorldType;
    notes?: string;
  };
};

export type QueryItem = {
  name: string;
  image_url: string;
  why_it_matters: string;
};

export type QueryResponse = {
  items: QueryItem[];
  next_steps: string[];
  warnings: string[];
};
