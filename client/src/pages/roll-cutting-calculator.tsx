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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Info,
  Scissors,
  Layers,
  LayoutGrid,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { calculate, CalcResult } from "@/lib/calculator_logic";

const schema = z.object({
  materialWidthMm: z.coerce.number().min(550).max(910),
  usefulWidthMm: z.coerce.number().min(550).max(910),
  rollWidthMm: z.coerce.number().min(20).max(310),
  rollLengthM: z.coerce.number().min(30).max(1100),
  bigRollLengthM: z.coerce.number().min(30).max(22000),
  orderRolls: z.coerce.number().int().positive().min(1),
  additionalWidthMm: z
    .union([z.coerce.number().min(20).max(310), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : (v as number | undefined))),
}).superRefine((val, ctx) => {
  if (val.usefulWidthMm > val.materialWidthMm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Полезная ширина не может быть больше ширины материала",
      path: ["usefulWidthMm"],
    });
  }
  if (val.bigRollLengthM < val.rollLengthM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Намотка Джамба должна быть не меньше длины рулона.",
      path: ["bigRollLengthM"],
    });
  }
});

type FormValues = z.infer<typeof schema>;

function formatMm(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} мм`;
}

function Scheme({ plan }: { plan: CalcResult }) {
  const {
    material_width_mm,
    useful_width_mm,
    main_count,
    roll_width_mm,
    additional_width_mm,
    waste_per_side_mm,
    inner_waste_mm,
    remaining_width_mm,
  } = plan;

  const pieces: Array<{ label: string; width: number; kind: string }> = [];

  if (waste_per_side_mm > 0.01) {
    pieces.push({
      label: formatMm(waste_per_side_mm),
      width: waste_per_side_mm,
      kind: "waste",
    });
  }

  for (let i = 0; i < main_count; i++) {
    pieces.push({
      label: formatMm(roll_width_mm),
      width: roll_width_mm,
      kind: "primary",
    });
  }

  if (additional_width_mm && additional_width_mm > 0) {
    pieces.push({
      label: formatMm(additional_width_mm),
      width: additional_width_mm,
      kind: "secondary",
    });
  }
  
  const innerWaste = remaining_width_mm - (additional_width_mm || 0);
  // Внутреннего отхода не существует на схеме, всё уходит в кромки
  // if (innerWaste > 0.01) { ... }

  if (waste_per_side_mm > 0.01) {
    pieces.push({
      label: formatMm(waste_per_side_mm),
      width: waste_per_side_mm,
      kind: "waste",
    });
  }

  const stripColor = (i: number) => {
    const hues = [210, 188, 260, 142, 22, 320];
    return `hsl(${hues[i % hues.length]} 80% 55%)`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium" data-testid="text-scheme-title">
          Схема раскроя
        </div>
        <div className="text-xs text-muted-foreground" data-testid="text-scheme-width">
          Общая: {material_width_mm} мм
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border bg-card p-3"
        data-testid="viz-scheme"
      >
        <div className="absolute inset-0 noise" />
        <div className="relative flex h-24 w-full rounded-xl bg-muted/40 p-1">
          {(() => {
            let rollIndex = 0;
            return pieces.map((p, idx) => {
              const pct = (p.width / material_width_mm) * 100;
              const isRoll = p.kind === "primary" || p.kind === "secondary";
              
              let isTop = true;
              if (isRoll) {
                isTop = rollIndex % 2 === 0;
                rollIndex++;
              }

              const bg =
                p.kind === "primary"
                  ? "hsl(var(--muted-foreground))"
                  : p.kind === "secondary"
                    ? "hsl(var(--primary))"
                    : p.kind === "waste" ? "hsl(var(--destructive) / 0.8)" : p.kind === "inner-waste" ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--destructive) / 0.4)";

              return (
                <div
                  key={`${p.kind}-${idx}`}
                  className="relative flex flex-col h-full justify-center"
                  style={{ width: `${pct}%` }}
                  title={p.label}
                  data-testid={`strip-${p.kind}-${idx}`}
                >
                  {isRoll ? (
                    <div 
                      className={cn(
                        "absolute w-full h-[48%] flex items-center justify-center text-white border border-background/20 rounded-[4px] shadow-sm overflow-hidden",
                        isTop ? "top-0" : "bottom-0"
                      )}
                      style={{ background: bg }}
                    >
                      <div className={cn("px-0.5 text-[10px] sm:text-[11px] font-medium leading-none text-center truncate", pct < 6 && "opacity-0")} data-testid={`text-strip-label-${idx}`}>
                        {p.label}
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-muted-foreground opacity-50 border-x border-background/10 overflow-hidden"
                      style={{ background: bg }}
                    >
                      {pct > 5 && (
                        <div className="text-[9px] leading-none text-center rotate-[-90deg] whitespace-nowrap">
                          {p.label}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs relative">
          <div className="flex items-center gap-2" data-testid="legend-primary">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "hsl(var(--muted-foreground))" }}
            />
            Основная
          </div>
          <div className="flex items-center gap-2" data-testid="legend-secondary">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "hsl(var(--primary))" }}
            />
            Доп.
          </div>
          <div className="flex items-center gap-2" data-testid="legend-waste">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "hsl(var(--destructive) / 0.8)" }}
            />
            Отход
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
      rollWidthMm: 57,
      rollLengthM: 400,
      bigRollLengthM: 10000,
      orderRolls: 50,
      additionalWidthMm: undefined,
    },
    mode: "onChange",
  });

  const values = form.watch();

  const { plan, errorMsg } = useMemo<{plan: CalcResult | null, errorMsg: string | null}>(() => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return { plan: null, errorMsg: null };
    try {
      const res = calculate(
        parsed.data.materialWidthMm,
        parsed.data.usefulWidthMm,
        parsed.data.rollWidthMm,
        parsed.data.rollLengthM,
        parsed.data.bigRollLengthM,
        parsed.data.orderRolls,
        parsed.data.additionalWidthMm ?? null
      );
      return { plan: res, errorMsg: null };
    } catch (e: any) {
      return { plan: null, errorMsg: e.message };
    }
  }, [values]);

  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const title = "Калькулятор Джамба";

  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_700px_at_30%_-10%,rgba(37,99,235,.18),transparent_60%),radial-gradient(900px_600px_at_110%_10%,rgba(20,184,166,.14),transparent_55%),linear-gradient(to_bottom,rgba(255,255,255,0.9),rgba(255,255,255,0.85))] dark:bg-[radial-gradient(1200px_700px_at_30%_-10%,rgba(37,99,235,.22),transparent_60%),radial-gradient(900px_600px_at_110%_10%,rgba(20,184,166,.12),transparent_55%),linear-gradient(to_bottom,rgba(2,6,23,0.9),rgba(2,6,23,0.95))]">
      <div className="app-safe mx-auto w-full max-w-[430px]">
        <header className="pt-4 px-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground glass">
                <Sparkles className="h-3.5 w-3.5" />
                iOS style
              </div>
              <h1
                className="mt-3 font-[Space_Grotesk,DM\ Sans,ui-sans-serif] text-2xl font-semibold tracking-tight"
                data-testid="text-app-title"
              >
                {title}
              </h1>
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

        <main className="pb-8 pt-4 px-4">
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
                    Параметры материала
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <Form {...form}>
                <form className="space-y-4" data-testid="form-inputs">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="materialWidthMm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-material-width">
                            Ширина, мм
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              className="rounded-2xl"
                              data-testid="input-material-width"
                            />
                          </FormControl>
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
                            Полезная, мм
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              className="rounded-2xl"
                              data-testid="input-useful-width"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="bigRollLengthM"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-big-roll">
                            Намотка Джамба, м
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              className="rounded-2xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="orderRolls"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-order">
                            Заказ, шт
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              className="rounded-2xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-2" />
                  
                  <div className="text-sm font-semibold">Размер готового рулона</div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="rollWidthMm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-roll-width">
                            Ширина, мм
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="decimal"
                              type="number"
                              step="0.1"
                              className="rounded-2xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="rollLengthM"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-roll-length">
                            Длина, м
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              inputMode="numeric"
                              type="number"
                              className="rounded-2xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="additionalWidthMm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-add-width">
                          Фиксированный доп. размер (опц.), мм
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            inputMode="decimal"
                            type="number"
                            step="0.1"
                            className="rounded-2xl"
                            placeholder="Автоматически"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                  </div>
                </div>

                {plan ? (
                  <Badge
                    variant="secondary"
                    className={cn("rounded-full", plan.waste_percent > 7 ? "bg-destructive/10 text-destructive border-destructive/20" : "")}
                  >
                    Отход: {plan.waste_percent.toFixed(1)}%
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-destructive/10 text-destructive border-destructive/20"
                  >
                    Ошибка
                  </Badge>
                )}
              </div>

              <Separator className="my-4" />

              {errorMsg ? (
                <div className="text-sm text-destructive">{errorMsg}</div>
              ) : plan ? (
                <div className="space-y-4">
                  <Scheme plan={plan} />

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border bg-card/70 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        Ручьев осн.
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {plan.main_count}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Ширина: {plan.roll_width_mm} мм
                      </div>
                    </div>
                    
                    <div className="rounded-2xl border bg-card/70 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        Ручьев доп.
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {plan.additional_width_mm ? 1 : 0}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {plan.additional_width_mm ? `Ширина: ${plan.additional_width_mm} мм` : "Нет доп. размера"}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    {plan.optimal_additional_rolls && plan.optimal_additional_rolls.length > 0 && (
                      <div className="mb-4 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-800/30 p-3">
                        <div className="flex items-start gap-2">
                          <Lightbulb className="w-4 h-4 text-orange-500 mt-0.5" />
                          <div>
                            <div className="font-medium text-orange-700 dark:text-orange-400">Оптимизация отхода</div>
                            <div className="text-orange-600/80 dark:text-orange-400/80 mt-1">
                              Отход более 7%. Рекомендуемый доп. размер:{" "}
                              <span className="font-bold cursor-pointer underline decoration-dotted" onClick={() => form.setValue("additionalWidthMm", plan.optimal_additional_rolls![0].width)}>
                                {plan.optimal_additional_rolls[0].width} мм
                              </span>{" "}
                              ({plan.optimal_additional_rolls[0].count} шт.)
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Всего рулонов осн.:</span>
                      <span className="font-medium">{plan.total_main_rolls} шт.</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Излишек / Нехватка:</span>
                      <span className="font-medium text-destructive">{plan.surplus_main_rolls} / {plan.shortage_rolls}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Доп. рулонов:</span>
                      <span className="font-medium">{plan.total_additional_rolls} шт.</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Отход на кромки (с 1 стороны):</span>
                      <span className="font-medium">{plan.waste_per_side_mm.toFixed(1)} мм</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Циклов (прогонов):</span>
                      <span className="font-medium">{plan.cycles_used}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Остаток Джамба:</span>
                      <span className="font-medium">{plan.remaining_jumbo_m} м</span>
                    </div>
                    {plan.shortage_rolls > 0 && (
                      <>
                        <div className="flex justify-between border-b border-border/50 pb-1 text-destructive">
                          <span className="text-muted-foreground text-destructive/80">Не хватает циклов:</span>
                          <span className="font-medium">{plan.shortage_cycles}</span>
                        </div>
                        <div className="flex justify-between border-b border-border/50 pb-1 text-destructive">
                          <span className="text-muted-foreground text-destructive/80">Не хватает метров:</span>
                          <span className="font-medium">{plan.shortage_length_m} м</span>
                        </div>
                      </>
                    )}
                    {plan.estimated_hours && (
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Примерное время:</span>
                        <span className="font-medium">
                          {(() => {
                            const totalMins = Math.round(plan.estimated_hours * 60);
                            const h = Math.floor(totalMins / 60);
                            const m = totalMins % 60;
                            return `${h} ч. ${m} мин.`;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Введите корректные данные
                </div>
              )}
            </Card>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
