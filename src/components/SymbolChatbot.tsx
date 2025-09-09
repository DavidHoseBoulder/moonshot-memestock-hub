import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Simple markdown parser for basic formatting
const parseMarkdown = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      return <strong key={index} className="font-semibold text-primary">{content}</strong>;
    }
    return part;
  });
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SymbolChatbotProps {
  symbol?: string;
  className?: string;
}

const SymbolChatbot: React.FC<SymbolChatbotProps> = ({ symbol, className = "" }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with welcome message when symbol changes
  useEffect(() => {
    if (symbol) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hi! I can help you explore data about ${symbol}. You can ask me about:

• Historical prices and market data
• Reddit mentions and sentiment analysis
• Trading signals and backtest results
• Recent news and market activity

What would you like to know about ${symbol}?`,
        timestamp: new Date()
      }]);
    }
  }, [symbol]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('symbol-ai-chat', {
        body: {
          message: input.trim(),
          symbol: symbol || null,
          conversationHistory: messages.slice(-10) // Send last 10 messages for context
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sorry, I encountered an error processing your request.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!symbol) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a symbol to start chatting about market data and insights.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} flex flex-col`}>
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Ask about {symbol}</h3>
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`flex items-start gap-2 max-w-[80%] ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`p-2 rounded-full ${
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div
                    className={`p-3 rounded-lg whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {parseMarkdown(message.content)}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex items-start gap-2">
                  <div className="p-2 rounded-full bg-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </ScrollArea>

        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask about ${symbol}...`}
            disabled={isLoading}
            className="flex-1"
          />
          <Button 
            onClick={sendMessage} 
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SymbolChatbot;