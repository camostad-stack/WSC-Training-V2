/*
 * Command Center Design: Architecture Page
 * - Pipeline visualization
 * - Prompt descriptions
 * - Data flow documentation
 * - MVP scope and roadmap
 */

import NavHeader from "@/components/NavHeader";
import { motion } from "framer-motion";
import {
  Network,
  Zap,
  MessageSquare,
  Eye,
  BarChart3,
  ClipboardCheck,
  TrendingUp,
  ArrowRight,
  Database,
  Shield,
  Phone,
  Users,
} from "lucide-react";

const PIPELINE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663357120672/T7ShWeUdbGNTJEK77SyZhN/pipeline-illustration-SiGD27Qh7SyYaqK8a2zwh6.webp";
const EVAL_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663357120672/T7ShWeUdbGNTJEK77SyZhN/evaluation-bg-6NR6VvMYnHJmyvoiDnn9ja.webp";

const prompts = [
  {
    num: "01",
    title: "Scenario Generator",
    icon: Zap,
    color: "text-teal",
    borderColor: "border-teal/30",
    desc: "Creates randomized, highly realistic customer scenario cards tailored to the employee's role, department, and selected difficulty level.",
    inputs: ["Department", "Employee Role", "Difficulty (1-5)", "Mode (In-Person/Phone)"],
    outputs: ["scenario_json with persona, hidden facts, success criteria, failure triggers"],
  },
  {
    num: "02",
    title: "AI Customer Simulator",
    icon: MessageSquare,
    color: "text-teal",
    borderColor: "border-teal/30",
    desc: "Plays the role of the customer in real-time, dynamically adjusting emotional state based on the employee's tone, accuracy, and de-escalation skills.",
    inputs: ["scenario_json", "transcript_so_far", "employee_response_summary"],
    outputs: ["customer_reply", "emotion state", "resolved/needs_manager flags"],
  },
  {
    num: "03",
    title: "Video Behavior Analyzer",
    icon: Eye,
    color: "text-amber",
    borderColor: "border-amber/30",
    desc: "Analyzes the employee's webcam feed for observable, job-relevant non-verbal behaviors while strictly avoiding inferences about protected traits.",
    inputs: ["scenario_type", "video_input"],
    outputs: ["camera_engagement", "posture_openness", "speech_pace", "interruptions"],
  },
  {
    num: "04",
    title: "Interaction Evaluator",
    icon: BarChart3,
    color: "text-teal",
    borderColor: "border-teal/30",
    desc: "Synthesizes the scenario card, full conversation transcript, and video analysis to produce a comprehensive, evidence-based competency score.",
    inputs: ["scenario_json", "full_transcript", "visible_cues_json"],
    outputs: ["overall_score (0-100)", "10 category scores", "strengths/misses", "evidence quotes"],
  },
  {
    num: "05",
    title: "Manager Coaching Note",
    icon: ClipboardCheck,
    color: "text-amber",
    borderColor: "border-amber/30",
    desc: "Distills the dense evaluation data into a concise, actionable summary designed for a 5-minute 1-on-1 coaching session.",
    inputs: ["evaluation_json"],
    outputs: ["manager_summary", "top 3 strengths/corrections", "next_drill", "follow-up flag"],
  },
  {
    num: "06",
    title: "Skill Profile Updater",
    icon: TrendingUp,
    color: "text-teal",
    borderColor: "border-teal/30",
    desc: "Maintains a longitudinal record of the employee's performance across multiple simulations, identifying growth trends and persistent gaps.",
    inputs: ["employee_profile_json", "evaluation_json"],
    outputs: ["updated_level_estimate", "rolling_scores", "recommended_next_scenarios"],
  },
];

const dataFlows = [
  { from: "Prompt 1", to: "Prompt 2", data: "scenario_json" },
  { from: "Prompt 2", to: "Prompt 4", data: "full_transcript" },
  { from: "Prompt 1", to: "Prompt 4", data: "scenario_json" },
  { from: "Prompt 3", to: "Prompt 4", data: "visible_cues_json" },
  { from: "Prompt 4", to: "Prompt 5", data: "evaluation_json" },
  { from: "Prompt 4", to: "Prompt 6", data: "evaluation_json" },
  { from: "Prompt 6", to: "Prompt 1", data: "recommended_scenarios (feedback loop)" },
];

const roadmap = [
  {
    phase: "MVP (Current)",
    color: "text-teal",
    items: ["Customer Service Team + Manager on Duty", "In-Person & Phone Modes", "Difficulty Levels 1-5", "10 Scenario Families", "Full Evaluation Pipeline"],
  },
  {
    phase: "Phase 2: Department Expansion",
    color: "text-amber",
    items: ["Golf Range Attendants", "Aquatics Staff", "Youth Program Coordinators", "Role-specific grading rubrics"],
  },
  {
    phase: "Phase 3: Modality Expansion",
    color: "text-muted-foreground",
    items: ["Asynchronous Video Upload", "Text/Chat Support Simulation", "Multi-language scenarios"],
  },
  {
    phase: "Phase 4: Advanced Analytics",
    color: "text-muted-foreground",
    items: ["Club-wide competency heatmaps", "Systemic training gap identification", "Automated scenario recommendations"],
  },
];

export default function Architecture() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      <div className="pt-14">
        <div className="container py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-md bg-teal/10 border border-teal/30 flex items-center justify-center">
              <Network className="w-5 h-5 text-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">System Architecture</h1>
              <p className="text-sm text-muted-foreground">6-prompt training pipeline documentation</p>
            </div>
          </motion.div>

          {/* Pipeline Visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="panel p-2 mb-8 glow-teal"
          >
            <img
              src={PIPELINE_IMG}
              alt="6-stage training pipeline"
              className="w-full rounded-md"
            />
          </motion.div>

          {/* Prompt Cards */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Database className="w-4 h-4 text-teal" />
              <span className="font-mono text-xs text-teal tracking-wider uppercase">
                Prompt Architecture
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prompts.map((p, i) => (
                <motion.div
                  key={p.num}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                  className={`panel p-5 border-l-2 ${p.borderColor}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-md bg-secondary flex items-center justify-center ${p.color}`}>
                      <p.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.num}</span>
                      <h3 className="text-sm font-semibold">{p.title}</h3>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{p.desc}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="font-mono text-[10px] text-teal tracking-wider uppercase">Inputs</span>
                      <div className="mt-1 space-y-0.5">
                        {p.inputs.map((inp) => (
                          <div key={inp} className="text-[11px] text-muted-foreground font-mono">{inp}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-amber tracking-wider uppercase">Outputs</span>
                      <div className="mt-1 space-y-0.5">
                        {p.outputs.map((out) => (
                          <div key={out} className="text-[11px] text-muted-foreground font-mono">{out}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Data Flow Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="panel p-5 mb-12"
          >
            <div className="flex items-center gap-2 mb-5">
              <ArrowRight className="w-4 h-4 text-teal" />
              <span className="font-mono text-xs text-teal tracking-wider uppercase">
                Data Flow
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-mono text-xs text-muted-foreground tracking-wider uppercase">From</th>
                    <th className="text-left py-2 px-3 font-mono text-xs text-muted-foreground tracking-wider uppercase">To</th>
                    <th className="text-left py-2 px-3 font-mono text-xs text-muted-foreground tracking-wider uppercase">Data Object</th>
                  </tr>
                </thead>
                <tbody>
                  {dataFlows.map((flow, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-3 font-mono text-xs">{flow.from}</td>
                      <td className="py-2 px-3 font-mono text-xs">{flow.to}</td>
                      <td className="py-2 px-3 font-mono text-xs text-teal">{flow.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* MVP Scope */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="mb-12"
          >
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-4 h-4 text-amber" />
              <span className="font-mono text-xs text-amber tracking-wider uppercase">
                MVP Scope & Roadmap
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {roadmap.map((phase, i) => (
                <motion.div
                  key={phase.phase}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  className={`panel p-4 ${i === 0 ? "border-teal/30 glow-teal" : ""}`}
                >
                  <span className={`font-mono text-xs font-semibold tracking-wider uppercase ${phase.color}`}>
                    {phase.phase}
                  </span>
                  <div className="mt-3 space-y-2">
                    {phase.items.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ArrowRight className={`w-3 h-3 shrink-0 mt-0.5 ${phase.color}`} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Supported Roles & Modes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3 }}
              className="panel p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-teal" />
                <span className="font-mono text-xs text-teal tracking-wider uppercase">Target Roles</span>
              </div>
              <div className="space-y-3">
                <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                  <span className="text-sm font-semibold">Customer Service Team Member</span>
                  <p className="text-xs text-muted-foreground mt-1">Front-line staff handling initial customer interactions</p>
                </div>
                <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                  <span className="text-sm font-semibold">Manager on Duty (MOD)</span>
                  <p className="text-xs text-muted-foreground mt-1">Handles escalated situations with full authority</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3 }}
              className="panel p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-4 h-4 text-amber" />
                <span className="font-mono text-xs text-amber tracking-wider uppercase">Interaction Modes</span>
              </div>
              <div className="space-y-3">
                <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                  <span className="text-sm font-semibold">In-Person Roleplay</span>
                  <p className="text-xs text-muted-foreground mt-1">Employee speaks to screen; AI responds via text/TTS. Video Behavior Analyzer active.</p>
                </div>
                <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                  <span className="text-sm font-semibold">Phone Call Roleplay</span>
                  <p className="text-xs text-muted-foreground mt-1">Audio-only channel simulating a member calling the front desk.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 border-t border-border/50">
        <div className="container flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono tracking-wider">WSC TRAINING SIMULATOR v1.0</span>
          <span>Woodinville Sports Club</span>
        </div>
      </footer>
    </div>
  );
}
