import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const senderEmailSchema = z.object({
  senderEmail: z.string().email("Please enter a valid email address"),
});

type SenderEmailFormData = z.infer<typeof senderEmailSchema>;

interface SenderEmailStepProps {
  onComplete: () => void;
  defaultValue?: string;
}

export function SenderEmailStep({ onComplete, defaultValue }: SenderEmailStepProps) {
  const { toast } = useToast();

  const form = useForm<SenderEmailFormData>({
    resolver: zodResolver(senderEmailSchema),
    defaultValues: {
      senderEmail: defaultValue || "",
    },
  });

  const saveSenderEmail = useMutation({
    mutationFn: async (data: SenderEmailFormData) => {
      const res = await apiRequest("POST", "/api/settings", {
        senderEmail: data.senderEmail,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save sender email");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Sender email saved successfully",
      });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <div className="p-2 bg-primary rounded-full">
          <Mail className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h4 className="font-semibold">Sender Email Address</h4>
          <p className="text-sm text-muted-foreground">
            This email address must be verified in your SendGrid account
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => saveSenderEmail.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="senderEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sender Email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder="your@company.com"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Button
              type="submit"
              className="w-full"
              disabled={saveSenderEmail.isPending}
            >
              {saveSenderEmail.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Sender Email"
              )}
            </Button>
          </div>
        </form>
      </Form>

      <div className="text-sm text-muted-foreground">
        <p className="font-semibold mb-2">How to verify your sender email:</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>Log in to your SendGrid account</li>
          <li>Go to Settings → Sender Authentication</li>
          <li>Click on "Verify a Single Sender"</li>
          <li>Fill in your sender details and submit</li>
          <li>Check your email for the verification link</li>
        </ol>
      </div>
    </div>
  );
}
