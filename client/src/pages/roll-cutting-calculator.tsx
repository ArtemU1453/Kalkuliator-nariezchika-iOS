import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Info,
  Scissors,
  Ruler,
  Layers,
  LayoutGrid,
  Sparkles,
} from "lucide-react";

const ALLOWED_TARGET_WIDTHS_MM = [
  500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 640,
  650, 660, 670, 680, 690, 700, 710, 720, 730, 740, 750, 760, 770, 780, 790,
  800, 810, 820, 830, 840, 850, 860, 870, 880, 890,
] as const;

const schema = z
  .object({
    materialWidthMm: z
      .coerce
      .number()
      .min(500, "Минимум 500")
      .max(910, "Максимум 910"),
    usefulWidthMm: z
      .coerce
      .number()
      .min(500, "Минимум 500")
      .max(890, "Максимум 890"),
    rollLengthM: z.coerce.number().positive("Введите длину рулона"),
    targetWidthMm: z.coerce.number(),
    requiredRolls: z
      .union([z.coerce.number().int().positive(), z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : (v as number | undefined))),
  })
  .superRefine((val, ctx) => {
    if (val.usefulWidthMm > val.materialWidthMm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Полезная ширина не может быть больше ширины материала",
        path: ["usefulWidthMm"],
      });
    }

    const allowed = new Set<number>(ALLOWED_TARGET_WIDTHS_MM as unknown as number[]);
    if (!allowed.has(val.targetWidthMm)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Выберите ширину из списка",
        path: ["targetWidthMm"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

type LayoutPlan = {
  primaryWidthMm: number;
  primaryCountPerRun: number;
  secondaryWidthMm?: number;
  secondaryCountPerRun: number;
  usedWidthMm: number;
  edgeWasteEachMm: number;
  wastePerRunMm: number;
  runs: number;
  outputRolls: number;
  stockRolls: number;
  materialAreaM2: number;
  usefulAreaM2: number;
  wasteAreaM2: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function bestPlan(
  usefulWidthMm: number,
  materialWidthMm: number,
  rollLengthM: number,
  primaryWidthMm: number,
  requiredRolls?: number,
): LayoutPlan {
  const primaryCountPerRun = Math.max(1, Math.floor(usefulWidthMm / primaryWidthMm));
  const usedPrimary = primaryCountPerRun * primaryWidthMm;
  const remaining = Math.max(0, usefulWidthMm - usedPrimary);

  let bestSecondaryWidth: number | undefined = undefined;
  let bestSecondaryCount = 0;
  let bestUsed = usedPrimary;

  const allowed = ALLOWED_TARGET_WIDTHS_MM as unknown as number[];
  for (const w2 of allowed) {
    if (w2 === primaryWidthMm) continue;
    const c2 = Math.floor(remaining / w2);
    if (c2 <= 0) continue;
    const used = usedPrimary + c2 * w2;
    if (used > bestUsed) {
      bestUsed = used;
      bestSecondaryWidth = w2;
      bestSecondaryCount = c2;
    }
  }

  const usedWidthMm = bestUsed;
  const wastePerRunMm = Math.max(0, usefulWidthMm - usedWidthMm);
  const edgeWasteEachMm = wastePerRunMm / 2;

  const outputRollsPerRun = primaryCountPerRun + bestSecondaryCount;
  const required = requiredRolls ?? outputRollsPerRun;
  const runs = Math.max(1, Math.ceil(required / outputRollsPerRun));

  const outputRolls = runs * outputRollsPerRun;
  const stockRolls = runs;

  const materialAreaM2 = (materialWidthMm / 1000) * rollLengthM * stockRolls;
  const usefulAreaM2 = (usedWidthMm / 1000) * rollLengthM * stockRolls;
  const wasteAreaM2 = Math.max(0, materialAreaM2 - usefulAreaM2);

  return {
    primaryWidthMm,
    primaryCountPerRun,
    secondaryWidthMm: bestSecondaryWidth,
    secondaryCountPerRun: bestSecondaryCount,
    usedWidthMm,
    edgeWasteEachMm,
    wastePerRunMm,
    runs,
    outputRolls,
    stockRolls,
    materialAreaM2: round2(materialAreaM2),
    usefulAreaM2: round2(usefulAreaM2),
    wasteAreaM2: round2(wasteAreaM2),
  };
}

function formatMm(n: number) {
  return `${Math.round(n)} mm`;
}

function stripColor(i: number) {
  const hues = [210, 188, 260, 142, 22, 320];
  const h = hues[i % hues.length];
  return `hsl(${h} 80% 55%)`;
}

function Scheme({
  usefulWidthMm,
  plan,
}: {
  usefulWidthMm: number;
  plan: LayoutPlan;
}) {
  const pieces: Array<{ label: string; width: number; kind: string }> = [];

  if (plan.edgeWasteEachMm > 0.01) {
    pieces.push({
      label: formatMm(plan.edgeWasteEachMm),
      width: plan.edgeWasteEachMm,
      kind: "waste",
    });
  }

  for (let i = 0; i < plan.primaryCountPerRun; i++) {
    pieces.push({
      label: formatMm(plan.primaryWidthMm),
      width: plan.primaryWidthMm,
      kind: "primary",
    });
  }

  for (let i = 0; i < plan.secondaryCountPerRun; i++) {
    pieces.push({
      label: formatMm(plan.secondaryWidthMm ?? 0),
      width: plan.secondaryWidthMm ?? 0,
      kind: "secondary",
    });
  }

  if (plan.edgeWasteEachMm > 0.01) {
    pieces.push({
      label: formatMm(plan.edgeWasteEachMm),
      width: plan.edgeWasteEachMm,
      kind: "waste",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium" data-testid="text-scheme-title">
          Схема раскроя (по полезной ширине)
        </div>
        <div className="text-xs text-muted-foreground" data-testid="text-scheme-width">
          Полезная ширина: {Math.round(usefulWidthMm)} мм
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border bg-card p-3"
        data-testid="viz-scheme"
      >
        <div className="absolute inset-0 noise" />
        <div className="relative flex h-16 w-full overflow-hidden rounded-xl bg-muted">
          {pieces.map((p, idx) => {
            const pct = (p.width / usefulWidthMm) * 100;
            const isWaste = p.kind === "waste";
            const bg =
              p.kind === "primary"
                ? stripColor(idx)
                : p.kind === "secondary"
                  ? "hsl(188 86% 40%)"
                  : "hsl(230 10% 70% / .35)";

            return (
              <div
                key={`${p.kind}-${idx}`}
                className={cn(
                  "relative flex h-full items-end justify-center border-r last:border-r-0",
                  isWaste ? "text-muted-foreground" : "text-white",
                )}
                style={{ width: `${pct}%`, background: bg }}
                data-testid={`strip-${p.kind}-${idx}`}
                title={p.label}
              >
                <div
                  className={cn(
                    "px-1 pb-1 text-[11px] leading-none transition-opacity",
                    pct < 10 ? "opacity-0" : "opacity-100",
                  )}
                  data-testid={`text-strip-label-${idx}`}
                >
                  {p.label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2" data-testid="legend-primary">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: stripColor(0) }}
            />
            Основная ширина
          </div>
          <div className="flex items-center gap-2" data-testid="legend-secondary">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "hsl(188 86% 40%)" }}
            />
            Доп. ширина
          </div>
          <div className="flex items-center gap-2" data-testid="legend-waste">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "hsl(230 10% 70% / .35)" }}
            />
            Кромка/отход
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RollCuttingCalculatorPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      materialWidthMm: 910,
      usefulWidthMm: 890,
      rollLengthM: 1000,
      targetWidthMm: 700,
      requiredRolls: undefined,
    },
    mode: "onChange",
  });

  const values = form.watch();

  const plan = useMemo(() => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return null;
    return bestPlan(
      parsed.data.usefulWidthMm,
      parsed.data.materialWidthMm,
      parsed.data.rollLengthM,
      parsed.data.targetWidthMm,
      parsed.data.requiredRolls,
    );
  }, [values]);

  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const title = "Калькулятор раскроя рулона";

  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_700px_at_30%_-10%,rgba(37,99,235,.18),transparent_60%),radial-gradient(900px_600px_at_110%_10%,rgba(20,184,166,.14),transparent_55%),linear-gradient(to_bottom,rgba(255,255,255,0.9),rgba(255,255,255,0.85))] dark:bg-[radial-gradient(1200px_700px_at_30%_-10%,rgba(37,99,235,.22),transparent_60%),radial-gradient(900px_600px_at_110%_10%,rgba(20,184,166,.12),transparent_55%),linear-gradient(to_bottom,rgba(2,6,23,0.9),rgba(2,6,23,0.95))]">
      <div className="app-safe mx-auto w-full max-w-[430px]">
        <header className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground glass">
                <Sparkles className="h-3.5 w-3.5" />
                Offline • client-side
              </div>
              <h1
                className="mt-3 font-[Space_Grotesk,DM\ Sans,ui-sans-serif] text-2xl font-semibold tracking-tight"
                data-testid="text-app-title"
              >
                {title}
              </h1>
              <p
                className="mt-1 text-sm text-muted-foreground"
                data-testid="text-app-subtitle"
              >
                Оптимальный раскрой по полезной ширине, с симметричными кромками.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="shrink-0 rounded-xl"
              onClick={() => setDark((v) => !v)}
              data-testid="button-toggle-theme"
            >
              {dark ? "Светлая" : "Тёмная"}
            </Button>
          </div>
        </header>

        <main className="pb-8 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            <Card
              className="glass noise rounded-3xl border-card-border p-4"
              data-testid="card-form"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
                  <Scissors className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold" data-testid="text-form-title">
                    Входные данные
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-form-hint">
                    Все расчёты выполняются на устройстве.
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <Form {...form}>
                <form className="space-y-3" data-testid="form-inputs">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="materialWidthMm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-material-width">
                            Ширина материала, мм
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              min={500}
                              max={910}
                              className="rounded-2xl"
                              data-testid="input-material-width"
                            />
                          </FormControl>
                          <FormDescription>500–910 мм</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="usefulWidthMm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-useful-width">
                            Полезная ширина, мм
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              min={500}
                              max={890}
                              className="rounded-2xl"
                              data-testid="input-useful-width"
                            />
                          </FormControl>
                          <FormDescription>500–890 мм</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="rollLengthM"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-roll-length">
                            Длина рулона, м
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="decimal"
                              type="number"
                              min={0}
                              step="0.01"
                              className="rounded-2xl"
                              data-testid="input-roll-length"
                            />
                          </FormControl>
                          <FormDescription>Например: 1000</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="requiredRolls"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-required-rolls">
                            Требуемо, шт (опц.)
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              inputMode="numeric"
                              type="number"
                              min={1}
                              step={1}
                              placeholder="например 24"
                              className="rounded-2xl"
                              data-testid="input-required-rolls"
                            />
                          </FormControl>
                          <FormDescription>
                            Если пусто — считаем 1 прогон
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="targetWidthMm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-target-width">
                          Целевая ширина рулона, мм
                        </FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="rounded-2xl"
                              data-testid="select-target-width"
                            >
                              <SelectValue placeholder="выберите" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent data-testid="select-content-target-width">
                            {(ALLOWED_TARGET_WIDTHS_MM as unknown as number[]).map((w) => (
                              <SelectItem
                                key={w}
                                value={String(w)}
                                data-testid={`option-target-width-${w}`}
                              >
                                {w} мм
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Можно добавить максимум одну доп. ширину для уменьшения отходов.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-2">
                    <Button
                      type="button"
                      className="w-full rounded-2xl"
                      onClick={() => form.trigger()}
                      data-testid="button-recalculate"
                    >
                      Пересчитать
                    </Button>
                  </div>

                  <div
                    className="flex items-start gap-2 rounded-2xl border bg-muted/60 p-3 text-xs text-muted-foreground"
                    data-testid="note-offline"
                  >
                    <Info className="mt-0.5 h-4 w-4" />
                    <div>
                      Офлайн: ничего не отправляется в интернет. Схема строится по полезной ширине.
                    </div>
                  </div>
                </form>
              </Form>
            </Card>

            <Card
              className="glass noise rounded-3xl border-card-border p-4"
              data-testid="card-results"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                    <LayoutGrid className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" data-testid="text-results-title">
                      Результаты
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="text-results-hint">
                      Подбор раскладки + площади
                    </div>
                  </div>
                </div>

                {plan ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full"
                    data-testid="badge-waste"
                  >
                    Отход: {Math.round(plan.wastePerRunMm)} мм
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="rounded-full"
                    data-testid="badge-invalid"
                  >
                    Проверьте ввод
                  </Badge>
                )}
              </div>

              <Separator className="my-4" />

              {plan ? (
                <div className="space-y-4">
                  <Scheme usefulWidthMm={values.usefulWidthMm || 1} plan={plan} />

                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className="rounded-2xl border bg-card/70 p-3"
                      data-testid="summary-runs"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        Прогоны
                      </div>
                      <div className="mt-1 text-xl font-semibold" data-testid="text-runs">
                        {plan.runs}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-stock-rolls">
                        Исходных рулонов: {plan.stockRolls}
                      </div>
                    </div>

                    <div
                      className="rounded-2xl border bg-card/70 p-3"
                      data-testid="summary-output"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Ruler className="h-4 w-4" />
                        Выход, шт
                      </div>
                      <div
                        className="mt-1 text-xl font-semibold"
                        data-testid="text-output-rolls"
                      >
                        {plan.outputRolls}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-per-run">
                        На прогон: {plan.primaryCountPerRun + plan.secondaryCountPerRun}
                      </div>
                    </div>

                    <div
                      className="rounded-2xl border bg-card/70 p-3"
                      data-testid="summary-areas"
                    >
                      <div className="text-xs text-muted-foreground" data-testid="text-areas-title">
                        Площади
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between" data-testid="row-area-material">
                          <span className="text-muted-foreground">Материал</span>
                          <span className="font-medium" data-testid="text-area-material">
                            {plan.materialAreaM2} м²
                          </span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="row-area-useful">
                          <span className="text-muted-foreground">Полезная</span>
                          <span className="font-medium" data-testid="text-area-useful">
                            {plan.usefulAreaM2} м²
                          </span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="row-area-waste">
                          <span className="text-muted-foreground">Отход</span>
                          <span className="font-medium" data-testid="text-area-waste">
                            {plan.wasteAreaM2} м²
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="rounded-2xl border bg-card/70 p-3"
                      data-testid="summary-layout"
                    >
                      <div className="text-xs text-muted-foreground" data-testid="text-layout-title">
                        Раскладка (на прогон)
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between" data-testid="row-layout-primary">
                          <span className="text-muted-foreground">Основная</span>
                          <span className="font-medium" data-testid="text-layout-primary">
                            {plan.primaryCountPerRun} × {plan.primaryWidthMm} мм
                          </span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="row-layout-secondary">
                          <span className="text-muted-foreground">Доп. ширина</span>
                          <span className="font-medium" data-testid="text-layout-secondary">
                            {plan.secondaryWidthMm
                              ? `${plan.secondaryCountPerRun} × ${plan.secondaryWidthMm} мм`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="row-layout-edge">
                          <span className="text-muted-foreground">Кромка</span>
                          <span className="font-medium" data-testid="text-layout-edge">
                            {Math.round(plan.edgeWasteEachMm)} мм с каждой стороны
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl border bg-muted/50 p-3 text-xs text-muted-foreground"
                    data-testid="note-assumptions"
                  >
                    Подбор делает максимум одну дополнительную ширину, чтобы уменьшить отход.
                    Отход по кромке распределён симметрично.
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground"
                  data-testid="state-invalid"
                >
                  Проверьте значения: полезная ширина должна быть ≤ ширины материала.
                </div>
              )}
            </Card>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
