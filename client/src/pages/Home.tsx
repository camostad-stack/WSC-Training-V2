/*
 * Command Center Design: Home / Landing Page
 * - Full-bleed hero with command center background image
 * - Grid-bg texture overlay
 * - Status-driven cards for the 6-prompt pipeline
 * - Asymmetric layout with large left hero text, right stats panel
 */

import NavHeader from "@/components/NavHeader";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Zap,
  MessageSquare,
  Eye,
  BarChart3,
  ClipboardCheck,
  TrendingUp,
  ArrowRight,
  Shield,
  Phone,
  Users,
} from "lucide-react";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663357120672/T7ShWeUdbGNTJEK77SyZhN/hero-command-center-ckhUafbZDUQHgLCgTF8JsL.webp";
const PIPELINE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663357120672/T7ShWeUdbGNTJEK77SyZhN/pipeline-illustration-SiGD27Qh7SyYaqK8a2zwh6.webp";

const pipelineSteps = [
  { icon: Zap, label: "Generate", desc: "AI creates realistic scenarios", color: "text-teal" },
  { icon: MessageSquare, label: "Simulate", desc: "Live roleplay with AI customer", color: "text-teal" },
  { icon: Eye, label: "Observe", desc: "Video behavior analysis", color: "text-amber" },
  { icon: BarChart3, label: "Evaluate", desc: "Evidence-based scoring", color: "text-teal" },
  { icon: ClipboardCheck, label: "Coach", desc: "Manager coaching notes", color: "text-amber" },
  { icon: TrendingUp, label: "Track", desc: "Rolling skill profiles", color: "text-teal" },
];

const stats = [
  { value: "16", label: "Scenario Templates" },
  { value: "5", label: "Difficulty Levels" },
  { value: "3", label: "Role Tracks" },
  { value: "3", label: "Session Modes" },
  { value: "11", label: "AI Services" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      {/* Hero Section */}
      <section className="relative pt-14 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${HERO_IMG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="absolute inset-0 grid-bg opacity-20" />

        <div className="relative container pt-20 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Left: Hero Text */}
            <div className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <span className="status-dot bg-teal" />
                  <span className="font-mono text-xs text-teal tracking-widest uppercase">
                    System Online
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                  <span className="text-foreground">Woodinville Sports Club</span>
                  <br />
                  <span className="text-teal">AI Training Platform</span>
                </h1>

                <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
                  Mobile-first practice for employees, operational review for managers,
                  and admin control for scenarios, policies, and access. Built around
                  real front desk, golf, and MOD incidents at WSC.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Link href="/practice">
                    <Button
                      size="lg"
                      className="bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2 transition-all duration-150"
                    >
                      Start Practice
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/manage">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-border text-foreground hover:bg-secondary/50 gap-2"
                    >
                      Open Manager View
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </div>

            {/* Right: Stats Panel */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <div className="panel p-6 glow-teal">
                <div className="flex items-center gap-2 mb-5">
                  <Shield className="w-4 h-4 text-teal" />
                  <span className="font-mono text-xs text-teal tracking-wider uppercase">
                    System Status
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {stats.map((s) => (
                    <div key={s.label} className="bg-background/50 rounded-md p-3 border border-border/50">
                      <div className="font-mono text-2xl font-bold text-teal">{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-amber" />
                    <span className="text-muted-foreground">Phone, In-Person, and Live Voice</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="w-4 h-4 text-amber" />
                    <span className="text-muted-foreground">Customer Service, Golf, and MOD tracks</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="w-4 h-4 text-teal" />
                    <span className="text-muted-foreground">Manager review, overrides, and audit logging</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section className="py-20 relative">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center mb-14"
          >
            <span className="font-mono text-xs text-amber tracking-widest uppercase">
              Training Pipeline
            </span>
            <h2 className="text-3xl font-bold mt-3 mb-4">
              Six-Stage Feedback Loop
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From scenario generation through real-time roleplay, behavioral observation,
              evidence-based evaluation, manager coaching, and longitudinal skill tracking.
            </p>
          </motion.div>

          {/* Pipeline Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14"
          >
            <div className="panel p-2 glow-teal max-w-4xl mx-auto">
              <img
                src={PIPELINE_IMG}
                alt="6-stage training pipeline: Generate, Simulate, Observe, Evaluate, Coach, Track"
                className="w-full rounded-md"
              />
            </div>
          </motion.div>

          {/* Pipeline Steps Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {pipelineSteps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="panel p-4 text-center group hover:glow-teal transition-all duration-150"
              >
                <div className="flex justify-center mb-3">
                  <div className={`w-10 h-10 rounded-md bg-secondary flex items-center justify-center ${step.color} group-hover:scale-110 transition-transform duration-150`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="font-mono text-xs font-semibold tracking-wider uppercase mb-1">
                  {step.label}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {step.desc}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Scenario Families Section */}
      <section className="py-20 border-t border-border/50">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center mb-12"
          >
            <span className="font-mono text-xs text-teal tracking-widest uppercase">
              WSC Coverage
            </span>
            <h2 className="text-3xl font-bold mt-3 mb-4">
              Real WSC Training Tracks
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Scenario templates cover front desk service, golf sales-service situations,
              and MOD or emergency-adjacent decisions that staff actually face.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto">
            {[
              "Billing Confusion",
              "Cancellation Request",
              "Reservation Issue",
              "Upset Parent",
              "Membership Question",
              "Member Complaint",
              "Hesitant Prospect",
              "Lesson Inquiry",
              "Range Complaint",
              "Refund / Credit",
              "Value Explanation",
              "Slippery Entry",
              "Power Interruption",
              "Unsafe Equipment",
              "Weather Incident",
              "Emergency Response",
            ].map((family, i) => (
              <motion.div
                key={family}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                className="panel px-4 py-3 text-center text-sm font-medium hover:border-teal/30 transition-colors duration-150"
              >
                {family}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 border-t border-border/50 relative">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="relative container text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="text-3xl font-bold mb-4">Ready to Train?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8">
              Start a practice session, review assigned drills, or move into the
              manager queue without detouring through demo-only pages.
            </p>
            <Link href="/practice">
              <Button
                size="lg"
                className="bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2"
              >
                Open Practice
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-border/50">
        <div className="container flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono tracking-wider">WSC AI TRAINING APP MVP</span>
          <span>Woodinville Sports Club</span>
        </div>
      </footer>
    </div>
  );
}
