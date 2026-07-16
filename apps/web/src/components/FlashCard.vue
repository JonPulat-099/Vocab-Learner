<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { PracticeCard } from "@vocab/shared";
import { gsap, motionOK } from "../lib/motion.js";
import type { Grade } from "../stores/practice.js";

const props = defineProps<{ card: PracticeCard }>();
const emit = defineEmits<{ grade: [g: Grade] }>();

const cardEl = ref<HTMLElement | null>(null);
const flipped = ref(false);
const dragX = ref(0);
const dragging = ref(false);
const leaving = ref(false);
// Suppress the flip transition for one frame when a new card arrives, so the
// next front face doesn't animate from the previous card's flipped state.
const noTransition = ref(false);

const SWIPE_THRESHOLD = 90;
const TAP_THRESHOLD = 6;
let startX = 0;
let moved = false;

const primarySense = computed(() => props.card.summary?.senses[0] ?? null);
const primaryExample = computed(() => primarySense.value?.examples[0] ?? null);

const dragStyle = computed(() => ({
  transform: `translateX(${dragX.value}px) rotate(${dragX.value / 18}deg)`,
}));

watch(
  () => props.card,
  async () => {
    noTransition.value = true;
    flipped.value = false;
    dragX.value = 0;
    leaving.value = false;
    if (cardEl.value) gsap.set(cardEl.value, { clearProps: "x,rotation,opacity" });
    await nextTick();
    requestAnimationFrame(() => (noTransition.value = false));
  },
);

function onPointerDown(e: PointerEvent): void {
  if (leaving.value) return;
  startX = e.clientX;
  moved = false;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || leaving.value) return;
  const dx = e.clientX - startX;
  if (Math.abs(dx) > TAP_THRESHOLD) moved = true;
  dragX.value = dx;
}

function onPointerUp(): void {
  if (!dragging.value || leaving.value) return;
  dragging.value = false;
  const dx = dragX.value;
  if (Math.abs(dx) > SWIPE_THRESHOLD) {
    swipeOut(dx > 0 ? 1 : 0);
    return;
  }
  dragX.value = 0;
  if (!moved) flipped.value = !flipped.value;
}

/** Animate the card off-screen, then report the grade. Buttons use this too. */
function swipeOut(g: Grade): void {
  if (leaving.value) return;
  leaving.value = true;
  const el = cardEl.value;
  if (!el || !motionOK()) {
    emit("grade", g);
    return;
  }
  const dir = g === 1 ? 1 : -1;
  // Hand the drag offset over to GSAP so the exit continues from where the finger left off.
  gsap.set(el, { x: dragX.value, rotation: dragX.value / 18 });
  dragX.value = 0;
  gsap.to(el, {
    x: dir * (window.innerWidth / 2 + el.offsetWidth),
    rotation: dir * 18,
    opacity: 0,
    duration: 0.35,
    ease: "power2.in",
    onComplete: () => emit("grade", g),
  });
}

function flip(): void {
  if (!leaving.value) flipped.value = !flipped.value;
}

defineExpose({ swipeOut, flip });
</script>

<template>
  <div class="w-full max-w-[360px] [perspective:1400px]">
    <div
      ref="cardEl"
      class="relative h-[420px] w-full cursor-pointer touch-pan-y select-none"
      :style="dragging ? dragStyle : undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div
        class="absolute inset-0 [transform-style:preserve-3d]"
        :class="noTransition ? '' : 'transition-transform duration-[450ms] ease-[var(--ease-standard)]'"
        :style="{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }"
      >
        <!-- Front: the prompt -->
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-3xl bg-section p-6 text-center shadow-md [backface-visibility:hidden]"
        >
          <p class="font-entry text-[40px] text-ink">{{ card.word }}</p>
          <p v-if="card.summary?.transcription" class="font-entry text-base text-hint">
            {{ card.summary.transcription }}
          </p>
          <span v-if="card.summary?.part_of_speech" class="text-xs uppercase tracking-wider text-hint">
            {{ card.summary.part_of_speech }}
          </span>
          <p class="absolute bottom-5 text-xs text-faint">Tap to flip</p>
        </div>

        <!-- Back: the answer -->
        <div
          class="absolute inset-0 flex flex-col justify-center gap-3 overflow-auto rounded-3xl bg-section p-7 text-left shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <template v-if="primarySense">
            <p class="text-base leading-snug text-ink">{{ primarySense.definition_en }}</p>
            <p class="text-sm italic text-ink-3">— {{ primarySense.translation_ru }}</p>
            <div v-if="primaryExample" class="mt-1.5 text-[13px] text-ink-2">
              <p>{{ primaryExample.en }}</p>
              <p class="mt-0.5 italic text-ink-3">{{ primaryExample.ru }}</p>
            </div>
          </template>
          <p v-else class="text-sm text-hint">No summary cached for this word yet.</p>
        </div>
      </div>
    </div>
  </div>
</template>
