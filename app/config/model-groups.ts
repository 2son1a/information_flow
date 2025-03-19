export interface PredefinedGroup {
  name: string;
  vertices: [number, number][];
  description?: string;
}

export const modelSpecificGroups: Record<string, PredefinedGroup[]> = {
  "gpt2-small": [
    {
      name: "Name Mover",
      vertices: [[9, 9], [10, 0], [9, 6]],
      description: "Attend to names and copy them to output. Active at END token position."
    },
    {
      name: "Negative",
      vertices: [[10, 7], [11, 10]],
      description: "Write in opposite direction of Name Movers, decreasing prediction confidence."
    },
    {
      name: "S Inhibition",
      vertices: [[8, 10], [7, 9], [8, 6], [7, 3]],
      description: "Reduce Name Mover Heads' attention to subject tokens. Attend to S2 and modify query patterns."
    },
    {
      name: "Induction",
      vertices: [[5, 5], [5, 9], [6, 9], [5, 8]],
      description: "Recognize [A][B]...[A] patterns to detect duplicated tokens via different mechanism."
    },
    {
      name: "Duplicate Token",
      vertices: [[0, 1], [0, 10], [3, 0]],
      description: "Identify repeated tokens. Active at S2, attend to S1, signal token duplication."
    },
    {
      name: "Previous Token",
      vertices: [[4, 11], [2, 2]],
      description: "Copy subject information to the token after S1. Support Induction Heads."
    },
    {
      name: "Backup Name Mover",
      vertices: [[11, 2], [10, 6], [10, 10], [10, 2], [9, 7], [10, 1], [11, 9], [9, 0]],
      description: "Normally inactive but replace Name Movers if they're disabled. Show circuit redundancy."
    }
  ],
  "pythia-2.8b": [
    {
      name: "Subject Heads",
      vertices: [
        [17, 2],   // L17H2
        [16, 12],  // L16H12
        [21, 9],   // L21H9
        [16, 20],  // L16H20
        [22, 17],  // L22H17
        [18, 14]   // L18H14
      ],
      description: "Attend to subject tokens and extract their attributes. May activate even when irrelevant to the query."
    },
    {
      name: "Relation Heads",
      vertices: [
        [13, 31],  // L13H31
        [18, 20],  // L18H20
        [14, 24],  // L14H24
        [21, 18]   // L21H18
      ],
      description: "Focus on relation tokens and boost possible answers for that relation type. Operate independently of subjects."
    },
    {
      name: "Mixed Heads",
      vertices: [
        [17, 17],  // L17H17
        [21, 23],  // L21H23
        [23, 22],  // L23H22
        [26, 8],   // L26H8
        [22, 15],  // L22H15
        [17, 30],  // L17H30
        [18, 25]   // L18H25
      ],
      description: "Attend to both subject and relation tokens. Extract correct attributes more effectively through \"subject to relation propagation.\""
    }
  ]
}; 