import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mail, Key, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyStep } from "./api-key-step";
import { SenderEmailStep } from "./sender-email-step";
import { useQuery } from "@tanstack/react-query";

interface Settings {
  sendGridApiKey?: string;
  senderEmail?: string;
  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  stripeSecretKey?: string;
  stripePublicKey?: string;
}

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

export function EmailConfigWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const { data: settings } = useQuery<Settings>({ 
    queryKey: ["/api/settings"],
  });

  const steps: Step[] = [
    {
      title: "SendGrid API Key",
      description: "Enter your SendGrid API key to enable email sending",
      icon: <Key className="w-6 h-6" />,
      component: (
        <ApiKeyStep
          onComplete={() => paginate(1)}
          defaultValue={settings?.sendGridApiKey}
        />
      ),
    },
    {
      title: "Sender Email",
      description: "Configure your verified sender email address",
      icon: <Mail className="w-6 h-6" />,
      component: (
        <SenderEmailStep
          onComplete={() => paginate(1)}
          defaultValue={settings?.senderEmail}
        />
      ),
    },
    {
      title: "Configuration Complete",
      description: "Your email settings are now configured",
      icon: <CheckCircle className="w-6 h-6" />,
      component: (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="p-2 bg-green-500 rounded-full">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h4 className="font-semibold">Setup Complete!</h4>
              <p className="text-sm text-muted-foreground">
                Your email configuration is ready to use
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>You can now:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Send invoices to customers via email</li>
              <li>Include PDF attachments automatically</li>
              <li>Track email delivery status</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const paginate = (newDirection: number) => {
    if (currentStep + newDirection >= 0 && currentStep + newDirection < steps.length) {
      setCurrentStep(currentStep + newDirection);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Email Configuration</CardTitle>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center mb-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center ${
                index !== steps.length - 1 ? "w-full" : ""
              }`}
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  index <= currentStep
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-gray-300"
                }`}
              >
                {step.icon}
              </div>
              {index !== steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-4 ${
                    index < currentStep ? "bg-primary" : "bg-gray-300"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="relative overflow-hidden min-h-[400px]">
          <AnimatePresence initial={false} custom={currentStep}>
            <motion.div
              key={currentStep}
              custom={currentStep}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(e, { offset, velocity }) => {
                const swipe = swipePower(offset.x, velocity.x);

                if (swipe < -swipeConfidenceThreshold) {
                  paginate(1);
                } else if (swipe > swipeConfidenceThreshold) {
                  paginate(-1);
                }
              }}
              className="absolute w-full"
            >
              <div className="p-4">
                <h3 className="text-xl font-semibold mb-4">{steps[currentStep].title}</h3>
                <p className="text-muted-foreground mb-6">{steps[currentStep].description}</p>
                {steps[currentStep].component}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => paginate(-1)}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          <Button
            onClick={() => paginate(1)}
            disabled={currentStep === steps.length - 1}
          >
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}