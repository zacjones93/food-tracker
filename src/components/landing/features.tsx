import {
  BookOpenIcon,
  CalendarDaysIcon,
  TagIcon,
  ChartBarIcon,
  ClockIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

const features = [
  {
    name: "Recipe Library",
    description:
      "Store all your favorite recipes in one place. Add emojis, tags, difficulty levels, and meal types to organize your collection.",
    icon: BookOpenIcon,
  },
  {
    name: "Weekly Planning",
    description:
      "Plan your meals week by week with visual boards. Move weeks through Current, Upcoming, and Archived states.",
    icon: CalendarDaysIcon,
  },
  {
    name: "Smart Organization",
    description:
      "Tag recipes by cuisine, dietary preferences, or any custom category. Filter and find exactly what you're looking for.",
    icon: TagIcon,
  },
  {
    name: "Usage Tracking",
    description:
      "Track how many times you've made each recipe and when you last cooked it. Rediscover forgotten favorites.",
    icon: ChartBarIcon,
  },
  {
    name: "Meal Scheduling",
    description:
      "Arrange recipes in your weekly plan with custom ordering. See all your planned meals at a glance.",
    icon: ClockIcon,
  },
  {
    name: "Simple & Clean",
    description:
      "Beautiful, intuitive interface that makes meal planning a joy. Dark mode support and responsive design included.",
    icon: SparklesIcon,
  },
];

export function Features() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-mystic-600 dark:text-mystic-400">
            Everything You Need
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Meal planning made simple
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            All the tools you need to organize recipes, plan meals, and keep track of your favorite dishes.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7">
                  <feature.icon
                    className="h-5 w-5 flex-none text-mystic-600 dark:text-mystic-400"
                    aria-hidden="true"
                  />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-muted-foreground">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
