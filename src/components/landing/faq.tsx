import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does the weekly meal planning work?",
    answer: (
      <>
        <p>Create weeks to organize your meal plans. Each week has three states:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Current:</strong> Your active meal plan for this week</li>
          <li><strong>Upcoming:</strong> Future weeks you&apos;re planning ahead for</li>
          <li><strong>Archived:</strong> Past weeks for reference and history</li>
        </ul>
        <p className="mt-2">Add recipes to each week and arrange them in any order you like.</p>
      </>
    ),
  },
  {
    question: "How do I organize my recipes?",
    answer: (
      <>
        <p>Recipes can be organized with multiple properties:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Tags:</strong> Custom labels like &quot;Italian&quot;, &quot;Quick&quot;, &quot;Vegetarian&quot;</li>
          <li><strong>Meal Type:</strong> Breakfast, Lunch, Dinner, Snack, Dessert</li>
          <li><strong>Difficulty:</strong> Easy, Medium, Hard</li>
          <li><strong>Emoji:</strong> A fun visual identifier for each recipe</li>
        </ul>
        <p className="mt-2">Search and filter your recipe collection to find exactly what you need.</p>
      </>
    ),
  },
  {
    question: "What is meal tracking?",
    answer: (
      <>
        <p>Track how often you make each recipe! The app automatically records:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Total number of times you&apos;ve made each dish</li>
          <li>When you last cooked it</li>
        </ul>
        <p className="mt-2">Use the increment button to log when you cook a recipe. Great for discovering favorites and forgotten gems!</p>
      </>
    ),
  },
  {
    question: "Can I link recipes together?",
    answer: (
      <>
        <p>Yes! Connect recipes as sides or accompaniments. For example, link &quot;Mashed Potatoes&quot; as a side to &quot;Roast Chicken&quot;. This helps you plan complete meals with main dishes and sides all organized together.</p>
      </>
    ),
  },
  {
    question: "Is my data private?",
    answer: (
      <>
        <p>Yes, your recipes and meal plans are completely private. Each user has their own account with secure authentication. Your data is stored securely and only you can access it.</p>
      </>
    ),
  },
  {
    question: "Does it work on mobile?",
    answer: (
      <>
        <p>Absolutely! The app is fully responsive and works great on phones and tablets. Access your recipes and meal plans from anywhere - perfect for grocery shopping or cooking in the kitchen.</p>
      </>
    ),
  },
];

export function FAQ() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl divide-y divide-mystic-900/10 dark:divide-cream-300/20">
          <h2 className="text-2xl font-bold leading-10 tracking-tight">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="w-full mt-10">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose dark:prose-invert w-full max-w-none">
                    {faq.answer}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
